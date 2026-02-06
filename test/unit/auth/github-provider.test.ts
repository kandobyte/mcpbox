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
        new URLSearchParams({ code: "test-code", state: "session-123" }),
      );

      assert.deepStrictEqual(result, {
        id: "github:12345",
        displayName: "octocat",
      });
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
});
