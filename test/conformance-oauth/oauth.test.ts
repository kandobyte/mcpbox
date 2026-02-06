import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  get,
  PORTS,
  post,
  postJson,
  startServer,
  stopServer,
  TEST_CLIENTS,
  TEST_CREDENTIALS,
} from "../helpers/index.js";

const BASE_URL = `http://localhost:${PORTS.OAUTH}`;

const TEST_CONFIG = {
  server: { port: PORTS.OAUTH },
  auth: {
    type: "oauth" as const,
    identityProviders: [
      { type: "local" as const, users: [TEST_CREDENTIALS.USER] },
    ],
    dynamicRegistration: true,
    clients: [TEST_CLIENTS.AUTH_CODE, TEST_CLIENTS.PUBLIC, TEST_CLIENTS.M2M],
  },
  mcps: [],
};

describe("OAuth Server", () => {
  before(async () => {
    await startServer(TEST_CONFIG);
  });

  after(async () => {
    await stopServer();
  });

  describe("RFC 8414 - Authorization Server Metadata", () => {
    it("should return metadata at well-known endpoint", async () => {
      const { status } = await get(
        BASE_URL,
        "/.well-known/oauth-authorization-server",
      );
      assert.strictEqual(status, 200);
    });

    it("should include required 'issuer' field matching request URL", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-authorization-server",
      );
      // RFC 8414 Section 2: issuer REQUIRED
      assert.strictEqual(data.issuer, BASE_URL);
    });

    it("should include authorization_endpoint", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-authorization-server",
      );
      // RFC 8414 Section 2: authorization_endpoint REQUIRED unless only client_credentials
      assert.strictEqual(data.authorization_endpoint, `${BASE_URL}/authorize`);
    });

    it("should include token_endpoint", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-authorization-server",
      );
      // RFC 8414 Section 2: token_endpoint REQUIRED unless only implicit
      assert.strictEqual(data.token_endpoint, `${BASE_URL}/token`);
    });

    it("should include response_types_supported", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-authorization-server",
      );
      // RFC 8414 Section 2: response_types_supported REQUIRED
      assert.ok(Array.isArray(data.response_types_supported));
      assert.ok((data.response_types_supported as string[]).includes("code"));
    });

    it("should include grant_types_supported with all supported grants", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-authorization-server",
      );
      assert.ok(Array.isArray(data.grant_types_supported));
      const grants = data.grant_types_supported as string[];
      assert.ok(grants.includes("authorization_code"));
      assert.ok(grants.includes("client_credentials"));
      assert.ok(grants.includes("refresh_token"));
    });

    it("should include token_endpoint_auth_methods_supported", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-authorization-server",
      );
      // RFC 8414 Section 2: defaults to client_secret_basic if not specified
      assert.ok(Array.isArray(data.token_endpoint_auth_methods_supported));
    });

    it("should include code_challenge_methods_supported for PKCE", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-authorization-server",
      );
      // RFC 8414 Section 2: PKCE support indication
      assert.ok(Array.isArray(data.code_challenge_methods_supported));
      const methods = data.code_challenge_methods_supported as string[];
      assert.ok(methods.includes("S256"), "S256 PKCE method required");
    });

    it("should return application/json content-type", async () => {
      const res = await fetch(
        `${BASE_URL}/.well-known/oauth-authorization-server`,
      );
      assert.ok(
        res.headers.get("content-type")?.includes("application/json"),
        "Must return application/json",
      );
    });
  });

  describe("RFC 9728 - Protected Resource Metadata", () => {
    it("should return metadata at well-known endpoint", async () => {
      const { status } = await get(
        BASE_URL,
        "/.well-known/oauth-protected-resource",
      );
      assert.strictEqual(status, 200);
    });

    it("should include required 'resource' field", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-protected-resource",
      );
      // RFC 9728 Section 2: resource REQUIRED
      assert.strictEqual(data.resource, BASE_URL);
    });

    it("should include authorization_servers array", async () => {
      const { data } = await get(
        BASE_URL,
        "/.well-known/oauth-protected-resource",
      );
      // RFC 9728 Section 2: authorization_servers OPTIONAL but recommended
      assert.ok(Array.isArray(data.authorization_servers));
      assert.ok(
        (data.authorization_servers as string[]).length > 0,
        "Should list at least one authorization server",
      );
    });
  });

  describe("RFC 7591 - Dynamic Client Registration", () => {
    it("should register a new client with valid redirect_uris", async () => {
      const { status, data } = await postJson(BASE_URL, "/register", {
        client_name: "Test App",
        redirect_uris: ["http://localhost:4000/callback"],
      });
      assert.strictEqual(status, 201);
      // RFC 7591 Section 3.2.1: client_id REQUIRED in response
      assert.ok(data.client_id, "Response must include client_id");
      assert.strictEqual(data.client_name, "Test App");
      assert.deepStrictEqual(data.redirect_uris, [
        "http://localhost:4000/callback",
      ]);
    });

    it("should return client_id_issued_at for new registrations", async () => {
      const { data } = await postJson(BASE_URL, "/register", {
        redirect_uris: ["http://localhost:4001/callback"],
      });
      // RFC 7591 Section 3.2.1: client_id_issued_at OPTIONAL
      // If provided, must be a number (Unix timestamp)
      if (data.client_id_issued_at !== undefined) {
        assert.strictEqual(typeof data.client_id_issued_at, "number");
      }
    });

    it("should reject registration without redirect_uris", async () => {
      const { status, data } = await postJson(BASE_URL, "/register", {
        client_name: "Bad App",
      });
      assert.strictEqual(status, 400);
      // RFC 7591 Section 3.2.2: error response format
      assert.strictEqual(data.error, "invalid_request");
    });

    it("should reject registration with invalid redirect URI", async () => {
      const { status, data } = await postJson(BASE_URL, "/register", {
        redirect_uris: ["not-a-valid-uri"],
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "invalid_redirect_uri");
    });

    it("should reject registration with empty redirect_uris array", async () => {
      const { status, data } = await postJson(BASE_URL, "/register", {
        redirect_uris: [],
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "invalid_request");
    });

    it("should return grant_types in response", async () => {
      const { data } = await postJson(BASE_URL, "/register", {
        redirect_uris: ["http://localhost:4002/callback"],
        grant_types: ["authorization_code", "refresh_token"],
      });
      // RFC 7591 Section 2: grant_types metadata
      assert.ok(Array.isArray(data.grant_types));
    });

    it("should return token_endpoint_auth_method in response", async () => {
      const { data } = await postJson(BASE_URL, "/register", {
        redirect_uris: ["http://localhost:4003/callback"],
      });
      // RFC 7591 Section 2: token_endpoint_auth_method
      assert.ok(data.token_endpoint_auth_method);
    });
  });

  describe("RFC 6749 - OAuth 2.0 Error Response Format", () => {
    it("should return error responses with required 'error' field", async () => {
      const { data } = await post(BASE_URL, "/token", {
        grant_type: "invalid_grant_type",
      });
      // RFC 6749 Section 5.2: error REQUIRED
      assert.ok(data.error, "Error response must include 'error' field");
      assert.strictEqual(typeof data.error, "string");
    });

    it("should use valid error codes from RFC 6749", async () => {
      // Test various error conditions and verify error codes
      const validErrorCodes = [
        "invalid_request",
        "invalid_client",
        "invalid_grant",
        "unauthorized_client",
        "unsupported_grant_type",
        "invalid_scope",
      ];

      const { data } = await post(BASE_URL, "/token", {
        grant_type: "password", // unsupported
      });
      assert.ok(
        validErrorCodes.includes(data.error as string),
        `Error code '${data.error}' must be a valid RFC 6749 error code`,
      );
    });

    it("should return 400 for invalid_request errors", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "authorization_code",
        // Missing required 'code' parameter
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "invalid_request");
    });

    it("should return 401 for invalid_client errors", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: "unknown-client",
        client_secret: "secret",
      });
      // RFC 6749 Section 5.2: 401 for invalid_client
      assert.strictEqual(status, 401);
      assert.strictEqual(data.error, "invalid_client");
    });

    it("should return 400 for unsupported_grant_type errors", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "password",
        username: "user",
        password: "pass",
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "unsupported_grant_type");
    });

    it("should optionally include error_description", async () => {
      const { data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        // Missing client_id
      });
      // RFC 6749 Section 5.2: error_description OPTIONAL
      if (data.error_description !== undefined) {
        assert.strictEqual(typeof data.error_description, "string");
      }
    });

    it("should return JSON content-type for error responses", async () => {
      const res = await fetch(`${BASE_URL}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=invalid",
      });
      assert.ok(
        res.headers.get("content-type")?.includes("application/json"),
        "Error responses must be application/json",
      );
    });
  });

  describe("RFC 6749 - Token Response Format", () => {
    it("should include required access_token in successful response", async () => {
      const { data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.M2M.clientId,
        client_secret: TEST_CLIENTS.M2M.clientSecret,
      });
      // RFC 6749 Section 5.1: access_token REQUIRED
      assert.ok(data.access_token, "Response must include access_token");
      assert.strictEqual(typeof data.access_token, "string");
    });

    it("should include required token_type in successful response", async () => {
      const { data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.M2M.clientId,
        client_secret: TEST_CLIENTS.M2M.clientSecret,
      });
      // RFC 6749 Section 5.1: token_type REQUIRED
      assert.ok(data.token_type, "Response must include token_type");
      assert.strictEqual(data.token_type, "Bearer");
    });

    it("should include expires_in for token lifetime", async () => {
      const { data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.M2M.clientId,
        client_secret: TEST_CLIENTS.M2M.clientSecret,
      });
      // RFC 6749 Section 5.1: expires_in RECOMMENDED
      assert.ok(data.expires_in, "Response should include expires_in");
      assert.strictEqual(typeof data.expires_in, "number");
      assert.ok((data.expires_in as number) > 0, "expires_in must be positive");
    });

    it("should return 200 status for successful token requests", async () => {
      const { status } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.M2M.clientId,
        client_secret: TEST_CLIENTS.M2M.clientSecret,
      });
      // RFC 6749 Section 5.1: 200 OK for success
      assert.strictEqual(status, 200);
    });

    it("should not include refresh_token for client_credentials grant", async () => {
      const { data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.M2M.clientId,
        client_secret: TEST_CLIENTS.M2M.clientSecret,
      });
      // RFC 6749 Section 4.4.3: refresh token SHOULD NOT be included
      assert.strictEqual(data.refresh_token, undefined);
    });
  });

  describe("RFC 7636 - PKCE", () => {
    it("should accept S256 code_challenge_method", async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      const params = new URLSearchParams({
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        redirect_uri: TEST_CLIENTS.AUTH_CODE.redirectUris[0],
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      assert.strictEqual(res.status, 200);
    });

    it("should accept plain code_challenge_method", async () => {
      const verifier = generateCodeVerifier();

      const params = new URLSearchParams({
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        redirect_uri: TEST_CLIENTS.AUTH_CODE.redirectUris[0],
        response_type: "code",
        code_challenge: verifier,
        code_challenge_method: "plain",
      });

      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      assert.strictEqual(res.status, 200);
    });

    it("should generate valid code_verifier format", () => {
      const verifier = generateCodeVerifier();
      // RFC 7636 Section 4.1: 43-128 characters, unreserved URI characters
      assert.ok(verifier.length >= 43, "Verifier must be at least 43 chars");
      assert.ok(verifier.length <= 128, "Verifier must be at most 128 chars");
      assert.ok(
        /^[A-Za-z0-9._~-]+$/.test(verifier),
        "Verifier must use unreserved characters",
      );
    });

    it("should generate valid S256 code_challenge", () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      // RFC 7636 Section 4.2: BASE64URL(SHA256(code_verifier))
      assert.ok(
        /^[A-Za-z0-9_-]+$/.test(challenge),
        "Challenge must be base64url encoded",
      );
    });

    it("should complete full PKCE flow with S256", async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // Use PUBLIC client (no client_secret, PKCE only)
      // Step 1: GET /authorize to get login form with session_id
      const authParams = new URLSearchParams({
        client_id: TEST_CLIENTS.PUBLIC.clientId,
        redirect_uri: TEST_CLIENTS.PUBLIC.redirectUris[0],
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      const authRes = await fetch(`${BASE_URL}/authorize?${authParams}`);
      assert.strictEqual(authRes.status, 200);
      const html = await authRes.text();

      // Extract session_id from form
      const sessionIdMatch = html.match(/name="session_id"\s+value="([^"]+)"/);
      assert.ok(sessionIdMatch, "Session ID should be in form");
      const sessionId = sessionIdMatch[1];

      // Step 2: POST /authorize with credentials to get auth code
      const loginRes = await fetch(`${BASE_URL}/authorize?${authParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: TEST_CREDENTIALS.USER.username,
          password: TEST_CREDENTIALS.USER.password,
          session_id: sessionId,
        }).toString(),
        redirect: "manual",
      });

      assert.strictEqual(loginRes.status, 302);
      const location = loginRes.headers.get("location");
      assert.ok(location, "Should redirect with location header");

      const redirectUrl = new URL(location);
      const code = redirectUrl.searchParams.get("code");
      assert.ok(code, "Should have authorization code");

      // Step 3: POST /token with code_verifier to get access token
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: TEST_CLIENTS.PUBLIC.redirectUris[0],
        client_id: TEST_CLIENTS.PUBLIC.clientId,
        code_verifier: verifier,
      });

      assert.strictEqual(status, 200);
      assert.ok(data.access_token, "Should return access token");
      assert.strictEqual(data.token_type, "Bearer");
    });

    it("should reject invalid code_verifier", async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // Use PUBLIC client (no client_secret, PKCE only)
      // Step 1: GET /authorize
      const authParams = new URLSearchParams({
        client_id: TEST_CLIENTS.PUBLIC.clientId,
        redirect_uri: TEST_CLIENTS.PUBLIC.redirectUris[0],
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });

      const authRes = await fetch(`${BASE_URL}/authorize?${authParams}`);
      const html = await authRes.text();
      const sessionIdMatch = html.match(/name="session_id"\s+value="([^"]+)"/);
      assert.ok(sessionIdMatch, "Session ID should be in form");
      const sessionId = sessionIdMatch[1];

      // Step 2: POST /authorize to get auth code
      const loginRes = await fetch(`${BASE_URL}/authorize?${authParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: TEST_CREDENTIALS.USER.username,
          password: TEST_CREDENTIALS.USER.password,
          session_id: sessionId,
        }).toString(),
        redirect: "manual",
      });

      const location = loginRes.headers.get("location");
      assert.ok(location, "Should redirect with location header");
      const code = new URL(location).searchParams.get("code");
      assert.ok(code, "Should have authorization code");

      // Step 3: POST /token with WRONG verifier
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: TEST_CLIENTS.PUBLIC.redirectUris[0],
        client_id: TEST_CLIENTS.PUBLIC.clientId,
        code_verifier: "wrong-verifier-that-does-not-match-challenge",
      });

      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "invalid_grant");
    });
  });

  describe("Client Credentials Grant", () => {
    it("should reject invalid client secret", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.M2M.clientId,
        client_secret: "wrong-secret",
      });
      assert.strictEqual(status, 401);
      assert.strictEqual(data.error, "invalid_client");
    });

    it("should reject client not authorized for client_credentials", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        client_secret: TEST_CLIENTS.AUTH_CODE.clientSecret,
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "unauthorized_client");
    });

    it("should reject missing client_id", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_secret: TEST_CLIENTS.M2M.clientSecret,
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "invalid_request");
    });
  });

  describe("Authorization Code Grant", () => {
    it("should reject authorize without required params", async () => {
      const res = await fetch(`${BASE_URL}/authorize`);
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.error, "invalid_request");
    });

    it("should reject authorize with unknown client", async () => {
      const params = new URLSearchParams({
        client_id: "unknown",
        redirect_uri: "http://localhost:3000/callback",
        response_type: "code",
      });
      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.error, "invalid_client");
    });

    it("should reject authorize with wrong redirect_uri", async () => {
      const params = new URLSearchParams({
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        redirect_uri: "http://evil.com/callback",
        response_type: "code",
      });
      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.error, "invalid_request");
    });

    it("should show login form for valid authorize request", async () => {
      const params = new URLSearchParams({
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        redirect_uri: TEST_CLIENTS.AUTH_CODE.redirectUris[0],
        response_type: "code",
      });
      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("<form"));
      assert.ok(html.includes("username"));
      assert.ok(html.includes("password"));
    });

    it("should include state in login form if provided", async () => {
      const params = new URLSearchParams({
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        redirect_uri: TEST_CLIENTS.AUTH_CODE.redirectUris[0],
        response_type: "code",
        state: "test-state-123",
      });
      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes("test-state-123"));
    });
  });

  describe("Token Validation", () => {
    it("should accept valid access token", async () => {
      const { data: tokenData } = await post(BASE_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.M2M.clientId,
        client_secret: TEST_CLIENTS.M2M.clientSecret,
      });

      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
        }),
      });
      assert.strictEqual(res.status, 200);
    });

    it("should reject invalid token", async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid-token",
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
        }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("should reject missing token", async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
        }),
      });
      assert.strictEqual(res.status, 401);
    });

    it("should reject malformed authorization header", async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
          Authorization: "NotBearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
        }),
      });
      assert.strictEqual(res.status, 401);
    });
  });

  describe("Refresh Token Grant", () => {
    it("should reject refresh without token", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "refresh_token",
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "invalid_request");
    });

    it("should reject invalid refresh token", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "refresh_token",
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        refresh_token: "invalid-token",
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "invalid_grant");
    });

    it("should reject refresh with wrong client_id", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "refresh_token",
        client_id: "wrong-client",
        refresh_token: "some-token",
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "invalid_grant");
    });
  });

  describe("Unsupported Grant Types", () => {
    it("should reject implicit grant", async () => {
      const { status, data } = await post(BASE_URL, "/token", {
        grant_type: "implicit",
      });
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error, "unsupported_grant_type");
    });
  });

  describe("Redirect URI Validation", () => {
    it("should reject mismatched redirect URI", async () => {
      const params = new URLSearchParams({
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        redirect_uri: "http://localhost:9999/different",
        response_type: "code",
      });
      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.error, "invalid_request");
    });

    it("should accept exact redirect URI match", async () => {
      const params = new URLSearchParams({
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        redirect_uri: TEST_CLIENTS.AUTH_CODE.redirectUris[0],
        response_type: "code",
      });
      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      assert.strictEqual(res.status, 200);
    });

    it("should reject redirect URI with different path", async () => {
      const params = new URLSearchParams({
        client_id: TEST_CLIENTS.AUTH_CODE.clientId,
        redirect_uri: "http://localhost:3000/other-callback",
        response_type: "code",
      });
      const res = await fetch(`${BASE_URL}/authorize?${params}`);
      assert.strictEqual(res.status, 400);
    });
  });

  describe("Health Check", () => {
    it("should return healthy status without auth", async () => {
      const { status, data } = await get(BASE_URL, "/health");
      assert.strictEqual(status, 200);
      assert.strictEqual(data.status, "ok");
    });
  });
});
