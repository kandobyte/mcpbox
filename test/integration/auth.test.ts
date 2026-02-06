import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import {
  mcpRequest,
  post,
  startServer,
  stopServer,
  TEST_API_KEY,
  TEST_CLIENTS,
} from "../helpers/index.js";

const APIKEY_PORT = 8082;
const APIKEY_URL = `http://localhost:${APIKEY_PORT}`;

const OAUTH_PORT = 8083;
const OAUTH_URL = `http://localhost:${OAUTH_PORT}`;

describe("Auth Middleware Integration", () => {
  describe("API Key Authentication", () => {
    before(async () => {
      await startServer({
        server: { port: APIKEY_PORT },
        auth: {
          type: "apikey",
          apiKey: TEST_API_KEY,
        },
        mcps: [],
      });
    });

    after(async () => {
      await stopServer();
    });

    it("should reject requests without API key", async () => {
      const { status } = await mcpRequest(APIKEY_URL, {
        jsonrpc: "2.0",
        method: "ping",
        id: 1,
      });
      assert.strictEqual(status, 401);
    });

    it("should reject requests with invalid API key", async () => {
      const { status } = await mcpRequest(
        APIKEY_URL,
        {
          jsonrpc: "2.0",
          method: "ping",
          id: 2,
        },
        { "X-API-Key": "wrong-api-key-12345" },
      );
      assert.strictEqual(status, 401);
    });

    it("should accept requests with valid X-API-Key header", async () => {
      const { status, json } = await mcpRequest(
        APIKEY_URL,
        {
          jsonrpc: "2.0",
          method: "ping",
          id: 3,
        },
        { "X-API-Key": TEST_API_KEY },
      );
      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      assert.deepStrictEqual(response.result, {});
    });

    it("should accept requests with valid Authorization Bearer header", async () => {
      const { status, json } = await mcpRequest(
        APIKEY_URL,
        {
          jsonrpc: "2.0",
          method: "ping",
          id: 4,
        },
        { Authorization: `Bearer ${TEST_API_KEY}` },
      );
      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      assert.deepStrictEqual(response.result, {});
    });

    it("should allow health endpoint without auth", async () => {
      const res = await fetch(`${APIKEY_URL}/health`);
      assert.strictEqual(res.status, 200);
    });

    it("should protect MCP endpoint", async () => {
      const { status } = await mcpRequest(APIKEY_URL, {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 5,
      });
      assert.strictEqual(status, 401);
    });

    it("should allow MCP endpoint with valid key", async () => {
      const { status, json } = await mcpRequest(
        APIKEY_URL,
        {
          jsonrpc: "2.0",
          method: "tools/list",
          id: 6,
        },
        { "X-API-Key": TEST_API_KEY },
      );
      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      assert.ok(Array.isArray(result.tools));
    });
  });

  describe("OAuth Token Authentication", () => {
    let accessToken: string;

    before(async () => {
      await startServer({
        server: { port: OAUTH_PORT },
        auth: {
          type: "oauth",
          clients: [TEST_CLIENTS.M2M],
        },
        mcps: [],
      });

      // Get an access token via client credentials
      const { status, data } = await post(OAUTH_URL, "/token", {
        grant_type: "client_credentials",
        client_id: TEST_CLIENTS.M2M.clientId,
        client_secret: TEST_CLIENTS.M2M.clientSecret,
      });
      assert.strictEqual(status, 200);
      accessToken = data.access_token as string;
      assert.ok(accessToken);
    });

    after(async () => {
      await stopServer();
    });

    it("should reject requests without token", async () => {
      const { status } = await mcpRequest(OAUTH_URL, {
        jsonrpc: "2.0",
        method: "ping",
        id: 1,
      });
      assert.strictEqual(status, 401);
    });

    it("should reject requests with invalid token", async () => {
      const { status } = await mcpRequest(
        OAUTH_URL,
        {
          jsonrpc: "2.0",
          method: "ping",
          id: 2,
        },
        { Authorization: "Bearer invalid-token-here" },
      );
      assert.strictEqual(status, 401);
    });

    it("should accept requests with valid OAuth token", async () => {
      const { status, json } = await mcpRequest(
        OAUTH_URL,
        {
          jsonrpc: "2.0",
          method: "ping",
          id: 3,
        },
        { Authorization: `Bearer ${accessToken}` },
      );
      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      assert.deepStrictEqual(response.result, {});
    });

    it("should allow well-known endpoints without auth", async () => {
      const res = await fetch(
        `${OAUTH_URL}/.well-known/oauth-authorization-server`,
      );
      assert.strictEqual(res.status, 200);
    });

    it("should allow health endpoint without auth", async () => {
      const res = await fetch(`${OAUTH_URL}/health`);
      assert.strictEqual(res.status, 200);
    });

    it("should include WWW-Authenticate header on 401", async () => {
      const res = await fetch(`${OAUTH_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      });
      assert.strictEqual(res.status, 401);
      const wwwAuth = res.headers.get("WWW-Authenticate");
      assert.ok(wwwAuth);
      assert.ok(wwwAuth.includes("Bearer"));
    });
  });

  describe("No Authentication", () => {
    const NO_AUTH_PORT = 8084;
    const NO_AUTH_URL = `http://localhost:${NO_AUTH_PORT}`;

    before(async () => {
      await startServer({
        server: { port: NO_AUTH_PORT },
        mcps: [],
      });
    });

    after(async () => {
      await stopServer();
    });

    it("should allow requests without any auth when not configured", async () => {
      const { status, json } = await mcpRequest(NO_AUTH_URL, {
        jsonrpc: "2.0",
        method: "ping",
        id: 1,
      });
      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      assert.deepStrictEqual(response.result, {});
    });

    it("should allow MCP operations without auth", async () => {
      const { status, json } = await mcpRequest(NO_AUTH_URL, {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 2,
      });
      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      assert.ok(Array.isArray(result.tools));
    });
  });
});
