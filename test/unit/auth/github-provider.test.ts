import assert from "node:assert";
import { after, describe, it } from "node:test";
import { GitHubIdentityProvider } from "../../../src/auth/providers/github.js";

// Mock fetch to intercept GitHub API calls
const originalFetch = globalThis.fetch;
let fetchMock: (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  fetchMock = handler as typeof fetchMock;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const urlStr =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url.url;
    return fetchMock(urlStr, init);
  }) as typeof fetch;
}

function jsonResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GitHubIdentityProvider", () => {
  after(() => {
    globalThis.fetch = originalFetch;
  });

  describe("getAuthorizationUrl", () => {
    it("should build GitHub authorization URL", () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      const url = provider.getAuthorizationUrl(
        "http://localhost:8080/callback/github",
        "session-123",
      );

      const parsed = new URL(url);
      assert.strictEqual(parsed.origin, "https://github.com");
      assert.strictEqual(parsed.pathname, "/login/oauth/authorize");
      assert.strictEqual(parsed.searchParams.get("client_id"), "gh-client-id");
      assert.strictEqual(
        parsed.searchParams.get("redirect_uri"),
        "http://localhost:8080/callback/github",
      );
      assert.strictEqual(parsed.searchParams.get("state"), "session-123");
      assert.strictEqual(parsed.searchParams.get("scope"), null);
    });

    it("should include read:org scope when allowed_orgs configured", () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["myorg"],
      });

      const url = provider.getAuthorizationUrl(
        "http://localhost:8080/callback/github",
        "session-123",
      );

      const parsed = new URL(url);
      assert.strictEqual(parsed.searchParams.get("scope"), "read:org");
    });
  });

  describe("handleCallback", () => {
    it("should return null when code is missing", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      const result = await provider.handleCallback(new URLSearchParams());
      assert.strictEqual(result, null);
    });

    it("should exchange code and return user on success", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      const requestLog: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }[] = [];

      mockFetch(async (url, init) => {
        requestLog.push({
          url,
          method: init?.method,
          headers: init?.headers as Record<string, string>,
          body: init?.body as string,
        });
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code", state: "session-123" }),
      );

      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });

      // Verify token exchange request
      const tokenReq = requestLog[0];
      assert.strictEqual(
        tokenReq.url,
        "https://github.com/login/oauth/access_token",
      );
      assert.strictEqual(tokenReq.method, "POST");
      assert.strictEqual(
        tokenReq.headers?.["Content-Type"],
        "application/json",
      );
      assert.strictEqual(tokenReq.headers?.Accept, "application/json");
      assert.ok(tokenReq.body, "token exchange should have a body");
      const tokenBody = JSON.parse(tokenReq.body);
      assert.strictEqual(tokenBody.client_id, "gh-client-id");
      assert.strictEqual(tokenBody.client_secret, "gh-client-secret");
      assert.strictEqual(tokenBody.code, "test-code");

      // Verify user info request
      const userReq = requestLog[1];
      assert.strictEqual(userReq.url, "https://api.github.com/user");
      assert.ok(userReq.headers?.Authorization?.startsWith("Bearer "));
      assert.ok(userReq.headers?.Authorization?.includes("gho_test_token"));
    });

    it("should return null when token exchange fails", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      mockFetch(async () => {
        return new Response("Server error", { status: 500 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "bad-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should return null when token response has error", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      mockFetch(async () => {
        return jsonResponse({ error: "bad_verification_code" });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "bad-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should return null when user info missing id", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ login: "octocat" });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should return null when user info missing login", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ id: 12345 });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should return null when user info fetch fails", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return new Response("Server error", { status: 500 });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should return null when org fetch fails", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["myorg"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        if (url.includes("api.github.com/user/orgs")) {
          return new Response("Server error", { status: 500 });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should reject user not in allowed_users", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedUsers: ["admin"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should accept user in allowed_users", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedUsers: ["octocat", "admin"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
    });

    it("should match allowed_users case-insensitively", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedUsers: ["Octocat"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
    });

    it("should reject user not in allowed_orgs", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["secret-org"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        if (url === "https://api.github.com/user/orgs?per_page=100") {
          return jsonResponse([{ login: "other-org" }]);
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should accept user in allowed_orgs", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["myorg"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        if (url === "https://api.github.com/user/orgs?per_page=100") {
          return jsonResponse([{ login: "myorg" }, { login: "other-org" }]);
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
    });

    it("should match allowed_orgs case-insensitively", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["MyOrg"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        if (url === "https://api.github.com/user/orgs?per_page=100") {
          return jsonResponse([{ login: "myorg" }]);
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
    });
  });

  describe("provider properties", () => {
    it("should have correct type and id", () => {
      const provider = new GitHubIdentityProvider({
        clientId: "id",
        clientSecret: "secret",
      });
      assert.strictEqual(provider.type, "redirect");
      assert.strictEqual(provider.id, "github");
      assert.strictEqual(provider.name, "GitHub");
      assert.ok(provider.buttonLabel.includes("Sign in with GitHub"));
      assert.ok(provider.buttonLabel.includes("<svg"));
    });
  });

  describe("getAuthorizationUrl edge cases", () => {
    it("should not include scope when allowedOrgs is empty array", () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: [],
      });

      const url = provider.getAuthorizationUrl(
        "http://localhost:8080/callback/github",
        "session-123",
      );

      const parsed = new URL(url);
      assert.strictEqual(parsed.searchParams.get("scope"), null);
    });
  });

  describe("handleCallback edge cases", () => {
    it("should return null when code is empty string", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "" }),
      );
      assert.strictEqual(result, null);
    });

    it("should accept user when allowedUsers is empty array (no restriction)", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedUsers: [],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
    });

    it("should accept user when allowedOrgs is empty array (no restriction)", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: [],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
    });

    it("should use access token from exchange when fetching user info", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
      });

      const fetchedUrls: { url: string; headers?: Record<string, string> }[] =
        [];

      mockFetch(async (url, init) => {
        fetchedUrls.push({
          url,
          headers: init?.headers as Record<string, string>,
        });
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_specific_token_abc" });
        }
        if (url.includes("api.github.com/user")) {
          return jsonResponse({ id: 99, login: "testuser" });
        }
        return new Response("Not found", { status: 404 });
      });

      await provider.handleCallback(new URLSearchParams({ code: "test-code" }));

      // Verify the user info request uses the token from the exchange
      const userReq = fetchedUrls.find((r) =>
        r.url.includes("api.github.com/user"),
      );
      assert.ok(userReq);
      assert.strictEqual(
        userReq.headers?.Authorization,
        "Bearer gho_specific_token_abc",
      );
      assert.strictEqual(userReq.headers?.Accept, "application/json");
    });

    it("should accept user who is member of any one allowed org", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["org-a", "org-b"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        if (url.includes("api.github.com/user/orgs")) {
          return jsonResponse([{ login: "org-b" }, { login: "unrelated-org" }]);
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
    });

    it("should reject user not in any of multiple allowed orgs", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["org-a", "org-b"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        if (url.includes("api.github.com/user/orgs")) {
          return jsonResponse([{ login: "unrelated-org" }]);
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.strictEqual(result, null);
    });

    it("should filter out orgs with missing login from membership check", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["myorg"],
      });

      mockFetch(async (url) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_test_token" });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        if (url.includes("api.github.com/user/orgs")) {
          return jsonResponse([
            { login: null },
            { id: 456 },
            { login: "myorg" },
          ]);
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await provider.handleCallback(
        new URLSearchParams({ code: "test-code" }),
      );
      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
    });

    it("should send correct Authorization header and Accept for org fetch", async () => {
      const provider = new GitHubIdentityProvider({
        clientId: "gh-client-id",
        clientSecret: "gh-client-secret",
        allowedOrgs: ["myorg"],
      });

      const orgReqHeaders: Record<string, string> = {};

      mockFetch(async (url, init) => {
        if (url.includes("login/oauth/access_token")) {
          return jsonResponse({ access_token: "gho_org_token" });
        }
        if (url === "https://api.github.com/user") {
          return jsonResponse({ id: 12345, login: "octocat" });
        }
        if (url.includes("api.github.com/user/orgs")) {
          Object.assign(orgReqHeaders, init?.headers);
          return jsonResponse([{ login: "myorg" }]);
        }
        return new Response("Not found", { status: 404 });
      });

      await provider.handleCallback(new URLSearchParams({ code: "test-code" }));

      assert.strictEqual(orgReqHeaders.Authorization, "Bearer gho_org_token");
      assert.strictEqual(orgReqHeaders.Accept, "application/json");
    });
  });
});
