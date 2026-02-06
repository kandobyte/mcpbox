import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Context } from "hono";
import { html, raw } from "hono/html";
import type { OAuthClient } from "../config/types.js";
import { logger } from "../logger.js";
import type { StateStore, StoredClient } from "../storage/types.js";
import {
  hashSecret,
  isRedirectUriAllowed,
  parseBearerToken,
  verifyClientSecret,
} from "./oauth-utils.js";
import type {
  AuthenticatedUser,
  FormIdentityProvider,
  IdentityProvider,
  RedirectIdentityProvider,
} from "./providers/identity-provider.js";

export interface OAuthConfig {
  issuer: string;
  providers: IdentityProvider[];
  clients?: OAuthClient[];
  dynamicRegistration?: boolean;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope?: string;
  expiresAt: number;
  userId: string;
}

interface PendingAuth {
  clientId: string;
  clientName?: string;
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  scope?: string;
  resource?: string;
  providerId?: string; // Tracks which identity provider is handling this session
}

export class OAuthServer {
  private store: StateStore;
  private authorizationCodes = new Map<string, AuthorizationCode>();
  private pendingAuths = new Map<string, PendingAuth>();

  constructor(
    private config: OAuthConfig,
    store: StateStore,
  ) {
    this.store = store;

    // Validate configuration
    if (config.dynamicRegistration && config.providers.length === 0) {
      throw new Error(
        "Invalid OAuth configuration: dynamic registration requires identity providers to be configured. " +
          "Dynamic clients use Authorization Code flow which requires user login.",
      );
    }

    // Load pre-registered clients into store
    if (config.clients) {
      for (const client of config.clients) {
        const grantType = client.grantType;

        // Validate requirements for each grant type
        if (grantType === "client_credentials") {
          if (!client.clientSecret) {
            throw new Error(
              `Invalid client "${client.clientId}": client_credentials grant requires clientSecret`,
            );
          }
        }

        if (grantType === "authorization_code") {
          if (!client.redirectUris || client.redirectUris.length === 0) {
            throw new Error(
              `Invalid client "${client.clientId}": authorization_code grant requires redirectUris`,
            );
          }
        }

        this.store.saveClient({
          clientId: client.clientId,
          clientName: client.clientName,
          clientSecret: client.clientSecret
            ? hashSecret(client.clientSecret)
            : undefined,
          redirectUris: client.redirectUris,
          grantTypes: [grantType],
          responseTypes: grantType === "authorization_code" ? ["code"] : [],
          tokenEndpointAuthMethod: client.clientSecret
            ? "client_secret_post"
            : "none",
          createdAt: Date.now(),
          isDynamic: false,
        });
        logger.info(
          {
            clientId: client.clientId,
            grantType,
          },
          "Pre-registered client loaded",
        );
      }
    }

    if (config.dynamicRegistration) {
      logger.info("Dynamic client registration enabled");
    }
  }

  close(): void {
    // Nothing to clean up - store handles its own cleanup
  }

  // RFC 9728: Protected Resource Metadata
  getProtectedResourceMetadata(): object {
    return {
      resource: this.config.issuer,
      authorization_servers: [this.config.issuer],
      scopes_supported: ["mcp:tools"],
      bearer_methods_supported: ["header"],
      // Non-standard: logo for client display
      logo_uri: `${this.config.issuer}/logo.png`,
    };
  }

  // RFC 8414: Authorization Server Metadata
  getAuthorizationServerMetadata(): object {
    const grantTypes: string[] = [];
    const hasProviders = this.config.providers.length > 0;

    // Authorization Code grant requires identity providers
    if (hasProviders) {
      grantTypes.push("authorization_code");
      grantTypes.push("refresh_token"); // Refresh tokens for Authorization Code flow
    }

    // Advertise client_credentials if any pre-registered client supports it
    if (
      this.config.clients?.some((c) => c.grantType === "client_credentials")
    ) {
      grantTypes.push("client_credentials");
    }

    const metadata: Record<string, unknown> = {
      issuer: this.config.issuer,
      token_endpoint: `${this.config.issuer}/token`,
      grant_types_supported: grantTypes,
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      scopes_supported: ["mcp:tools"],
    };

    // Only advertise authorization endpoint if identity providers are configured
    if (hasProviders) {
      metadata.authorization_endpoint = `${this.config.issuer}/authorize`;
      metadata.response_types_supported = ["code"];
      metadata.code_challenge_methods_supported = ["S256"];
    }

    // Only advertise registration if enabled
    if (this.config.dynamicRegistration) {
      metadata.registration_endpoint = `${this.config.issuer}/register`;
    }

    // Include logo
    metadata.logo_uri = `${this.config.issuer}/logo.png`;

    return metadata;
  }

  // RFC 7591: Dynamic Client Registration
  async handleRegister(c: Context, body: string): Promise<Response> {
    if (!this.config.dynamicRegistration) {
      return c.json({ error: "registration_not_supported" }, 404);
    }

    // Wire format input (snake_case per RFC 7591)
    let request: {
      client_name?: string;
      redirect_uris?: string[];
      grant_types?: string[];
      response_types?: string[];
      token_endpoint_auth_method?: string;
    };

    try {
      request = JSON.parse(body);
    } catch {
      return c.json(
        {
          error: "invalid_request",
          error_description: "Invalid JSON",
        },
        400,
      );
    }

    // Validate redirect_uris
    if (
      !request.redirect_uris ||
      !Array.isArray(request.redirect_uris) ||
      request.redirect_uris.length === 0
    ) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "redirect_uris required",
        },
        400,
      );
    }

    // Validate redirect URIs are valid URLs
    for (const uri of request.redirect_uris) {
      try {
        new URL(uri);
      } catch {
        return c.json(
          {
            error: "invalid_redirect_uri",
            error_description: "Invalid redirect URI",
          },
          400,
        );
      }
    }

    // Generate client credentials
    const clientId = randomUUID();

    // Translate wire format (snake_case) to internal (camelCase)
    const client: StoredClient = {
      clientId,
      clientName: request.client_name,
      redirectUris: request.redirect_uris,
      grantTypes: request.grant_types ?? ["authorization_code"],
      responseTypes: request.response_types ?? ["code"],
      tokenEndpointAuthMethod: request.token_endpoint_auth_method ?? "none",
      createdAt: Date.now(),
      isDynamic: true,
    };

    this.store.saveClient(client);

    logger.info(
      {
        clientId,
        clientName: request.client_name,
        redirectUris: request.redirect_uris,
      },
      "Dynamic client registered",
    );

    // Translate internal (camelCase) back to wire format (snake_case) for response
    return c.json(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      },
      201,
    );
  }

  // Get client by ID
  private getClient(clientId: string): StoredClient | null {
    return this.store.getClient(clientId);
  }

  // Handle authorization request
  async handleAuthorize(
    c: Context,
    query: URLSearchParams,
    body?: string,
  ): Promise<Response> {
    // Authorization Code flow requires identity providers to be configured
    if (this.config.providers.length === 0) {
      return c.json(
        {
          error: "invalid_request",
          error_description:
            "Authorization Code flow not available. Use Client Credentials grant or configure identity providers.",
        },
        400,
      );
    }

    const clientId = query.get("client_id");
    const redirectUri = query.get("redirect_uri");
    const responseType = query.get("response_type");
    const state = query.get("state") ?? undefined;
    const codeChallenge = query.get("code_challenge") ?? undefined;
    const codeChallengeMethod = query.get("code_challenge_method") ?? undefined;
    const scope = query.get("scope") ?? undefined;

    // Validate required params
    if (
      !clientId ||
      !redirectUri ||
      responseType !== "code" ||
      !codeChallenge
    ) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "Missing required parameters",
        },
        400,
      );
    }

    if (codeChallengeMethod !== "S256") {
      return c.json(
        {
          error: "invalid_request",
          error_description: "Only S256 code challenge method is supported",
        },
        400,
      );
    }

    // Get and validate client
    const client = this.getClient(clientId);
    if (!client) {
      return c.json(
        {
          error: "invalid_client",
          error_description: "Unknown client_id",
        },
        400,
      );
    }

    // Validate redirect URI
    if (!isRedirectUriAllowed(redirectUri, client)) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "Invalid redirect_uri",
        },
        400,
      );
    }

    // If POST with credentials, process form login
    if (c.req.method === "POST" && body) {
      const formData = new URLSearchParams(body);
      const username = formData.get("username");
      const password = formData.get("password");
      const sessionId = formData.get("session_id");

      if (!sessionId) {
        return c.html("<html><body>Invalid session</body></html>", 400);
      }

      const pending = this.pendingAuths.get(sessionId);
      if (!pending) {
        return c.html("<html><body>Session expired</body></html>", 400);
      }

      // Try each form-based identity provider sequentially;
      const formProviders = this.config.providers.filter(
        (p): p is FormIdentityProvider => p.type === "form",
      );
      let authenticatedUser: AuthenticatedUser | null = null;
      for (const provider of formProviders) {
        authenticatedUser = await provider.validate(
          username ?? "",
          password ?? "",
        );
        if (authenticatedUser) break;
      }
      if (!authenticatedUser) {
        return this.showLoginForm(
          c,
          pending,
          sessionId,
          "Invalid username or password",
        );
      }

      return this.issueAuthorizationCode(
        c,
        pending,
        sessionId,
        authenticatedUser,
      );
    }

    // GET request — check for idp param to initiate redirect flow
    const idp = query.get("idp");
    if (idp) {
      const redirectProvider = this.config.providers.find(
        (p): p is RedirectIdentityProvider =>
          p.type === "redirect" && p.id === idp,
      );
      if (!redirectProvider) {
        return c.json(
          {
            error: "invalid_request",
            error_description: `Unknown identity provider: ${idp}`,
          },
          400,
        );
      }

      return this.redirectToProvider(c, redirectProvider, {
        clientId,
        clientName: client.clientName,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scope,
      });
    }

    // GET request without idp — show login form (or auto-redirect for single provider)
    const pendingAuth: PendingAuth = {
      clientId,
      clientName: client.clientName,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      scope,
    };

    // If only one redirect provider and no form providers, redirect immediately
    const formProviders = this.config.providers.filter(
      (p) => p.type === "form",
    );
    const redirectProviders = this.config.providers.filter(
      (p): p is RedirectIdentityProvider => p.type === "redirect",
    );
    if (formProviders.length === 0 && redirectProviders.length === 1) {
      return this.redirectToProvider(c, redirectProviders[0], pendingAuth);
    }

    const sessionId = randomUUID();
    this.pendingAuths.set(sessionId, pendingAuth);

    setTimeout(
      () => this.pendingAuths.delete(sessionId),
      10 * 60 * 1000,
    ).unref();

    return this.showLoginForm(c, pendingAuth, sessionId);
  }

  // Issue an authorization code and redirect to the client callback
  private issueAuthorizationCode(
    c: Context,
    pending: PendingAuth,
    sessionId: string,
    user: AuthenticatedUser,
  ): Response {
    const code = randomBytes(32).toString("hex");
    this.authorizationCodes.set(code, {
      code,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      scope: pending.scope,
      expiresAt: Date.now() + 10 * 60 * 1000,
      userId: user.id,
    });

    this.pendingAuths.delete(sessionId);

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (pending.state) {
      redirectUrl.searchParams.set("state", pending.state);
    }

    logger.info(
      { clientId: pending.clientId, userId: user.id },
      "Authorization code issued",
    );

    return c.redirect(redirectUrl.toString(), 302);
  }

  // Create a pending auth session and redirect to an external identity provider
  private redirectToProvider(
    c: Context,
    provider: RedirectIdentityProvider,
    pending: PendingAuth,
  ): Response {
    const sessionId = randomUUID();
    pending.providerId = provider.id;
    this.pendingAuths.set(sessionId, pending);

    setTimeout(
      () => this.pendingAuths.delete(sessionId),
      10 * 60 * 1000,
    ).unref();

    const callbackUrl = `${this.config.issuer}/callback/${provider.id}`;
    const authUrl = provider.getAuthorizationUrl(callbackUrl, sessionId);
    return c.redirect(authUrl, 302);
  }

  // Handle callback from external identity providers
  async handleIdPCallback(
    c: Context,
    providerId: string,
    query: URLSearchParams,
  ): Promise<Response> {
    const state = query.get("state");
    if (!state) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "Missing state parameter",
        },
        400,
      );
    }

    const pending = this.pendingAuths.get(state);
    if (!pending) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "Invalid or expired session",
        },
        400,
      );
    }

    if (pending.providerId !== providerId) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "Provider mismatch",
        },
        400,
      );
    }

    const provider = this.config.providers.find(
      (p): p is RedirectIdentityProvider =>
        p.type === "redirect" && p.id === providerId,
    );
    if (!provider) {
      return c.json(
        {
          error: "invalid_request",
          error_description: `Unknown identity provider: ${providerId}`,
        },
        400,
      );
    }

    const user = await provider.handleCallback(query);
    if (!user) {
      this.pendingAuths.delete(state);
      return c.json(
        {
          error: "access_denied",
          error_description: "Authentication failed",
        },
        403,
      );
    }

    return this.issueAuthorizationCode(c, pending, state, user);
  }

  private showLoginForm(
    c: Context,
    pending: PendingAuth,
    sessionId: string,
    error?: string,
  ): Response {
    const displayName = pending.clientName ?? pending.clientId;
    const scopeDisplay = pending.scope ?? "default";

    // Build base authorize URL (used for both form action and redirect links)
    const authorizeParams = new URLSearchParams();
    authorizeParams.set("client_id", pending.clientId);
    authorizeParams.set("redirect_uri", pending.redirectUri);
    authorizeParams.set("response_type", "code");
    if (pending.state) authorizeParams.set("state", pending.state);
    if (pending.codeChallenge)
      authorizeParams.set("code_challenge", pending.codeChallenge);
    if (pending.codeChallengeMethod)
      authorizeParams.set("code_challenge_method", pending.codeChallengeMethod);
    if (pending.scope) authorizeParams.set("scope", pending.scope);

    const formAction = `/authorize?${authorizeParams.toString()}`;

    const formProviders = this.config.providers.filter(
      (p) => p.type === "form",
    );
    const redirectProviders = this.config.providers.filter(
      (p): p is RedirectIdentityProvider => p.type === "redirect",
    );

    // Build redirect provider buttons
    const redirectButtons = redirectProviders.map((p) => {
      const idpParams = new URLSearchParams(authorizeParams);
      idpParams.set("idp", p.id);
      return html`<a
        class="idp-button"
        href="/authorize?${idpParams.toString()}"
        >${raw(p.buttonLabel)}</a
      >`;
    });

    const hasForm = formProviders.length > 0;
    const hasRedirect = redirectProviders.length > 0;

    const page = html`
      <!doctype html>
      <html>
        <head>
          <title>MCPBox</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            .logo {
              display: block;
              width: 64px;
              height: 64px;
              margin: 0 auto 16px auto;
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              background: #fafaf9;
              margin: 0;
              padding: 20px;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .card {
              background: white;
              border-radius: 8px;
              box-shadow:
                0 4px 24px rgba(0, 0, 0, 0.06),
                0 1px 2px rgba(0, 0, 0, 0.04);
              padding: 48px 40px;
              width: 100%;
              max-width: 380px;
            }
            h1 {
              font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas,
                monospace;
              font-size: 28px;
              font-weight: 600;
              color: #1c1917;
              text-align: center;
              margin: 0 0 8px 0;
              letter-spacing: -0.5px;
            }
            .subtitle {
              text-align: center;
              color: #6b6560;
              font-size: 15px;
              margin: 0 0 32px 0;
              line-height: 1.4;
            }
            .client-name {
              color: #1c1917;
              font-weight: 500;
            }
            form {
              display: flex;
              flex-direction: column;
              gap: 20px;
            }
            .field {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            label {
              font-size: 13px;
              font-weight: 500;
              color: #1c1917;
            }
            input {
              padding: 14px 16px;
              font-size: 16px;
              border: 1px solid #e7e5e4;
              border-radius: 4px;
              background: #fff;
              transition: border-color 0.2s ease;
              outline: none;
            }
            input:focus {
              border-color: #1c1917;
              box-shadow: none;
            }
            button {
              margin-top: 8px;
              padding: 16px;
              font-size: 16px;
              font-weight: 500;
              background: #1c1917;
              color: #fafaf9;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              transition: opacity 0.2s ease;
            }
            button:hover {
              opacity: 0.9;
            }
            button:active {
              transform: scale(0.98);
            }
            .error {
              background: color-mix(in srgb, #dc2626 10%, transparent);
              color: #dc2626;
              padding: 12px 16px;
              border-radius: 4px;
              font-size: 14px;
              text-align: center;
            }
            .scope {
              text-align: center;
              font-size: 12px;
              color: #6b6560;
              margin-top: 24px;
            }
            .divider {
              display: flex;
              align-items: center;
              gap: 16px;
              margin: 24px 0;
              color: #a8a29e;
              font-size: 13px;
            }
            .divider::before,
            .divider::after {
              content: "";
              flex: 1;
              height: 1px;
              background: #e7e5e4;
            }
            .idp-button {
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 12px 16px;
              font-size: 16px;
              font-weight: 500;
              background: #24292f;
              color: #fff;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              text-align: center;
              text-decoration: none;
              transition: background 0.15s ease;
            }
            .idp-button:hover {
              background: #32383f;
            }
            .idp-buttons {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="/logo.png" alt="MCPBox" class="logo" />
            <h1>MCPBox</h1>
            <p class="subtitle">
              <span class="client-name">${displayName}</span> wants to access
              tools
            </p>
            ${error ? html`<p class="error">${error}</p>` : ""}
            ${
              hasRedirect
                ? html`<div class="idp-buttons">${redirectButtons}</div>`
                : ""
            }
            ${hasForm && hasRedirect ? html`<div class="divider">or</div>` : ""}
            ${
              hasForm
                ? html`<form method="POST" action="${formAction}">
                  <input
                    type="hidden"
                    name="session_id"
                    value="${sessionId}"
                  />
                  <div class="field">
                    <label for="username">Username</label>
                    <input
                      type="text"
                      id="username"
                      name="username"
                      required
                      autofocus
                      autocomplete="username"
                    />
                  </div>
                  <div class="field">
                    <label for="password">Password</label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      required
                      autocomplete="current-password"
                    />
                  </div>
                  <button type="submit">Continue</button>
                </form>`
                : ""
            }
            <p class="scope">Scope: ${scopeDisplay}</p>
          </div>
        </body>
      </html>
    `;

    return c.html(page.toString());
  }

  // Handle token request
  async handleToken(c: Context, body: string): Promise<Response> {
    const params = new URLSearchParams(body);
    const grantType = params.get("grant_type");
    const clientId = params.get("client_id");
    const clientSecret = params.get("client_secret");

    // Client Credentials Grant (RFC 6749 Section 4.4)
    if (grantType === "client_credentials") {
      return this.handleClientCredentialsGrant(c, clientId, clientSecret);
    }

    // Authorization Code Grant (RFC 6749 Section 4.1)
    if (grantType === "authorization_code") {
      const code = params.get("code");
      const redirectUri = params.get("redirect_uri");
      const codeVerifier = params.get("code_verifier");
      return this.handleAuthorizationCodeGrant(
        c,
        clientId,
        clientSecret,
        code,
        redirectUri,
        codeVerifier,
      );
    }

    // Refresh Token Grant (RFC 6749 Section 6)
    if (grantType === "refresh_token") {
      const refreshToken = params.get("refresh_token");
      return this.handleRefreshTokenGrant(
        c,
        clientId,
        clientSecret,
        refreshToken,
      );
    }

    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  // RFC 6749 Section 4.4: Client Credentials Grant
  private handleClientCredentialsGrant(
    c: Context,
    clientId: string | null,
    clientSecret: string | null,
  ): Response {
    if (!clientId || !clientSecret) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "client_id and client_secret required",
        },
        400,
      );
    }

    const client = this.getClient(clientId);
    if (!client) {
      return c.json(
        {
          error: "invalid_client",
          error_description: "Unknown client",
        },
        401,
      );
    }

    if (!client.grantTypes.includes("client_credentials")) {
      return c.json(
        {
          error: "unauthorized_client",
          error_description:
            "Client not authorized for client_credentials grant",
        },
        400,
      );
    }

    if (
      !client.clientSecret ||
      !verifyClientSecret(clientSecret, client.clientSecret)
    ) {
      return c.json(
        {
          error: "invalid_client",
          error_description: "Invalid client credentials",
        },
        401,
      );
    }

    // Issue access token directly
    const accessToken = randomBytes(32).toString("hex");
    const expiresIn = 3600;

    this.store.saveAccessToken({
      token: hashSecret(accessToken),
      clientId,
      scope: "mcp:tools",
      expiresAt: Date.now() + expiresIn * 1000,
      userId: `client:${clientId}`, // Mark as client-authenticated
    });

    logger.info({ clientId }, "Client credentials token issued");

    c.header("Cache-Control", "no-store");
    return c.json({
      access_token: accessToken, // Return unhashed token to client
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: "mcp:tools",
    });
  }

  // RFC 6749 Section 4.1: Authorization Code Grant
  private handleAuthorizationCodeGrant(
    c: Context,
    clientId: string | null,
    clientSecret: string | null,
    code: string | null,
    redirectUri: string | null,
    codeVerifier: string | null,
  ): Response {
    if (!code || !clientId) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "Missing code or client_id",
        },
        400,
      );
    }

    // Validate client
    const client = this.getClient(clientId);
    if (!client) {
      return c.json(
        {
          error: "invalid_client",
          error_description: "Unknown client",
        },
        400,
      );
    }

    // Validate client secret if required (timing-safe comparison)
    if (
      client.clientSecret &&
      (!clientSecret || !verifyClientSecret(clientSecret, client.clientSecret))
    ) {
      return c.json(
        {
          error: "invalid_client",
          error_description: "Invalid client credentials",
        },
        401,
      );
    }

    const authCode = this.authorizationCodes.get(code);
    if (!authCode) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Invalid authorization code",
        },
        400,
      );
    }

    if (authCode.expiresAt < Date.now()) {
      this.authorizationCodes.delete(code);
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Authorization code expired",
        },
        400,
      );
    }

    if (authCode.clientId !== clientId) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Client ID mismatch",
        },
        400,
      );
    }

    if (redirectUri && authCode.redirectUri !== redirectUri) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Redirect URI mismatch",
        },
        400,
      );
    }

    // Validate PKCE (mandatory per OAuth 2.1)
    if (!authCode.codeChallenge) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Code challenge missing from authorization code",
        },
        400,
      );
    }

    if (!codeVerifier) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Code verifier required",
        },
        400,
      );
    }

    const hash = createHash("sha256").update(codeVerifier).digest("base64url");

    if (hash !== authCode.codeChallenge) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Invalid code verifier",
        },
        400,
      );
    }

    this.authorizationCodes.delete(code);

    // Issue access token
    const accessToken = randomBytes(32).toString("hex");
    const expiresIn = 3600;

    this.store.saveAccessToken({
      token: hashSecret(accessToken),
      clientId,
      scope: authCode.scope,
      expiresAt: Date.now() + expiresIn * 1000,
      userId: authCode.userId,
    });

    // Issue refresh token (90 days)
    const refreshToken = randomBytes(32).toString("hex");
    this.store.saveRefreshToken({
      token: hashSecret(refreshToken),
      clientId,
      scope: authCode.scope,
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
      userId: authCode.userId,
    });

    logger.info({ clientId, userId: authCode.userId }, "Access token issued");

    c.header("Cache-Control", "no-store");
    return c.json({
      access_token: accessToken, // Return unhashed tokens to client
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: authCode.scope,
    });
  }

  // RFC 6749 Section 6: Refresh Token Grant
  private handleRefreshTokenGrant(
    c: Context,
    clientId: string | null,
    clientSecret: string | null,
    refreshToken: string | null,
  ): Response {
    if (!refreshToken || !clientId) {
      return c.json(
        {
          error: "invalid_request",
          error_description: "refresh_token and client_id required",
        },
        400,
      );
    }

    const refreshTokenHash = hashSecret(refreshToken);
    const stored = this.store.getRefreshToken(refreshTokenHash);
    if (!stored) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Invalid refresh token",
        },
        400,
      );
    }

    if (stored.clientId !== clientId) {
      return c.json(
        {
          error: "invalid_grant",
          error_description: "Client ID mismatch",
        },
        400,
      );
    }

    // Validate client secret if client has one
    const client = this.getClient(clientId);
    if (
      client?.clientSecret &&
      (!clientSecret || !verifyClientSecret(clientSecret, client.clientSecret))
    ) {
      return c.json(
        {
          error: "invalid_client",
          error_description: "Invalid client credentials",
        },
        401,
      );
    }

    // Refresh token rotation: atomically invalidate old token and issue new one
    const newRefreshToken = randomBytes(32).toString("hex");
    this.store.rotateRefreshToken(refreshTokenHash, {
      token: hashSecret(newRefreshToken),
      clientId,
      scope: stored.scope,
      expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
      userId: stored.userId,
    });

    // Issue new access token
    const accessToken = randomBytes(32).toString("hex");
    const expiresIn = 3600;

    this.store.saveAccessToken({
      token: hashSecret(accessToken),
      clientId,
      scope: stored.scope,
      expiresAt: Date.now() + expiresIn * 1000,
      userId: stored.userId,
    });

    logger.info(
      { clientId, userId: stored.userId },
      "Tokens refreshed with rotation",
    );

    c.header("Cache-Control", "no-store");
    return c.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: stored.scope,
    });
  }

  validateToken(authHeader: string | undefined): {
    valid: boolean;
    userId?: string;
    error?: string;
  } {
    const token = parseBearerToken(authHeader);
    if (!token) {
      return {
        valid: false,
        error: authHeader
          ? "Invalid authorization header format"
          : "No authorization header",
      };
    }

    const tokenHash = hashSecret(token);
    const accessToken = this.store.getAccessToken(tokenHash);

    if (!accessToken) {
      return { valid: false, error: "Invalid token" };
    }

    return { valid: true, userId: accessToken.userId };
  }

  sendUnauthorized(c: Context, error?: string): Response {
    const wwwAuth = `Bearer resource_metadata="${this.config.issuer}/.well-known/oauth-protected-resource"`;
    c.header("WWW-Authenticate", wwwAuth);
    return c.json(
      {
        error: "unauthorized",
        error_description: error ?? "Authentication required",
      },
      401,
    );
  }
}
