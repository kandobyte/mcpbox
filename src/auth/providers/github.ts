import { logger } from "../../logger.js";
import type {
  AuthenticatedUser,
  RedirectIdentityProvider,
} from "./identity-provider.js";

interface GitHubIdPOptions {
  clientId: string;
  clientSecret: string;
  allowedOrgs?: string[];
  allowedUsers?: string[];
}

export class GitHubIdentityProvider implements RedirectIdentityProvider {
  type = "redirect" as const;
  id = "github";
  name = "GitHub";
  buttonLabel =
    '<svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" style="vertical-align:middle;margin-right:8px"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>Sign in with GitHub';

  constructor(private options: GitHubIdPOptions) {}

  getAuthorizationUrl(callbackUrl: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: callbackUrl,
      state,
    });

    // Only request org scope if we need to check org membership
    if (this.options.allowedOrgs && this.options.allowedOrgs.length > 0) {
      params.set("scope", "read:org");
    }

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async handleCallback(
    params: URLSearchParams,
  ): Promise<AuthenticatedUser | null> {
    const code = params.get("code");
    if (!code) {
      logger.warn("GitHub callback missing code parameter");
      return null;
    }

    // Exchange code for access token
    const tokenRes = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          code,
        }),
      },
    );

    if (!tokenRes.ok) {
      logger.warn({ status: tokenRes.status }, "GitHub token exchange failed");
      return null;
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };
    if (!tokenData.access_token) {
      logger.warn(
        { error: tokenData.error },
        "GitHub token exchange returned no access_token",
      );
      return null;
    }

    const accessToken = tokenData.access_token;

    // Fetch user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!userRes.ok) {
      logger.warn({ status: userRes.status }, "GitHub user info fetch failed");
      return null;
    }

    const userData = (await userRes.json()) as {
      id?: number;
      login?: string;
    };
    if (!userData.id || !userData.login) {
      logger.warn("GitHub user info missing id or login");
      return null;
    }

    // Check allowed_users
    if (this.options.allowedUsers && this.options.allowedUsers.length > 0) {
      const loginLower = userData.login.toLowerCase();
      if (
        !this.options.allowedUsers.some((u) => u.toLowerCase() === loginLower)
      ) {
        logger.info(
          { login: userData.login },
          "GitHub user not in allowed_users",
        );
        return null;
      }
    }

    // Check allowed_orgs
    if (this.options.allowedOrgs && this.options.allowedOrgs.length > 0) {
      const orgsRes = await fetch(
        "https://api.github.com/user/orgs?per_page=100",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        },
      );

      if (!orgsRes.ok) {
        logger.warn(
          { status: orgsRes.status },
          "GitHub org membership fetch failed",
        );
        return null;
      }

      const orgs = (await orgsRes.json()) as Array<{ login?: string }>;
      const userOrgLogins = orgs
        .map((o) => o.login?.toLowerCase())
        .filter((l): l is string => !!l);
      const isMember = this.options.allowedOrgs.some((org) =>
        userOrgLogins.includes(org.toLowerCase()),
      );

      if (!isMember) {
        logger.info(
          { login: userData.login, userOrgs: userOrgLogins },
          "GitHub user not in any allowed org",
        );
        return null;
      }
    }

    logger.info(
      { login: userData.login, id: userData.id },
      "GitHub authentication successful",
    );

    return {
      id: `github:${userData.id}`,
      displayName: userData.login,
    };
  }
}
