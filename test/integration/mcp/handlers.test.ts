import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  mcpRequest,
  PORTS,
  startServer,
  stopServer,
} from "../../helpers/index.js";

const BASE_URL = `http://localhost:${PORTS.MCP}`;

const TEST_CONFIG = {
  server: { port: PORTS.MCP },
  auth: undefined,
  mcps: [],
};

describe("MCP Protocol Handlers", () => {
  before(async () => {
    await startServer(TEST_CONFIG);
  });

  after(async () => {
    await stopServer();
  });

  describe("JSON-RPC Parsing", () => {
    it("should reject invalid JSON with parse error", async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error.code, -32700); // Parse error
    });

    it("should reject empty body", async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      });
      assert.strictEqual(res.status, 400);
    });
  });

  describe("initialize", () => {
    it("should return server info and capabilities", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 1);

      const result = response.result as Record<string, unknown>;
      assert.ok(result);
      assert.strictEqual(result.protocolVersion, "2025-11-25");

      const serverInfo = result.serverInfo as Record<string, unknown>;
      assert.ok(serverInfo);
      assert.strictEqual(serverInfo.name, "mcpbox");
    });

    it("should reject initialize without required params", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "initialize",
        id: 2,
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      assert.strictEqual(response.id, 2);
      const error = response.error as Record<string, unknown>;
      assert.ok(error);
      assert.strictEqual(error.code, ErrorCode.InvalidParams);
    });
  });

  describe("notifications/initialized", () => {
    it("should accept initialized notification with 202", async () => {
      const { status } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
      assert.strictEqual(status, 202);
    });

    it("should not return a response body for notifications", async () => {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });
      assert.strictEqual(res.status, 202);
      const text = await res.text();
      assert.strictEqual(text, "");
    });
  });

  describe("tools/list", () => {
    it("should return empty tools list when no MCPs configured", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 3,
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      assert.ok(result);
      assert.ok(Array.isArray(result.tools));
      assert.strictEqual((result.tools as unknown[]).length, 0);
    });
  });

  describe("tools/call", () => {
    it("should return error for unknown tool", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "tools/call",
        id: 4,
        params: {
          name: "nonexistent_tool",
          arguments: {},
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const error = response.error as Record<string, unknown>;
      assert.ok(error);
      assert.strictEqual(error.code, -32603); // Internal error
    });

    it("should return error for missing tool name", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "tools/call",
        id: 5,
        params: {
          arguments: {},
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      assert.ok(response.error);
    });
  });

  describe("resources/list", () => {
    it("should return empty resources list when no MCPs configured", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "resources/list",
        id: 10,
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      assert.ok(result);
      assert.ok(Array.isArray(result.resources));
      assert.strictEqual((result.resources as unknown[]).length, 0);
    });
  });

  describe("resources/read", () => {
    it("should return error for unknown resource", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "resources/read",
        id: 11,
        params: {
          uri: "nonexistent__file:///unknown",
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const error = response.error as Record<string, unknown>;
      assert.ok(error);
      assert.strictEqual(error.code, -32603);
    });
  });

  describe("prompts/list", () => {
    it("should return empty prompts list when no MCPs configured", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "prompts/list",
        id: 12,
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      assert.ok(result);
      assert.ok(Array.isArray(result.prompts));
      assert.strictEqual((result.prompts as unknown[]).length, 0);
    });
  });

  describe("prompts/get", () => {
    it("should return error for unknown prompt", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "prompts/get",
        id: 13,
        params: {
          name: "nonexistent__prompt",
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const error = response.error as Record<string, unknown>;
      assert.ok(error);
      assert.strictEqual(error.code, -32603);
    });
  });

  describe("ping", () => {
    it("should respond to ping with empty result", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "ping",
        id: 99,
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 99);
      assert.deepStrictEqual(response.result, {});
    });
  });

  describe("Unknown Method", () => {
    it("should return method not found error", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "unknown/method",
        id: 6,
      });

      assert.strictEqual(status, 200); // JSON-RPC errors still return 200
      const response = json as Record<string, unknown>;
      const error = response.error as Record<string, unknown>;
      assert.strictEqual(error.code, -32601); // Method not found
    });
  });

  describe("Health Check", () => {
    it("should return healthy status", async () => {
      const res = await fetch(`${BASE_URL}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, "ok");
    });

    it("should include content-type header", async () => {
      const res = await fetch(`${BASE_URL}/health`);
      assert.ok(res.headers.get("content-type")?.includes("application/json"));
    });
  });

  describe("404 Handling", () => {
    it("should return 404 for unknown routes", async () => {
      const res = await fetch(`${BASE_URL}/unknown`);
      assert.strictEqual(res.status, 404);
    });

    it("should return 404 for unknown methods on valid routes", async () => {
      const res = await fetch(`${BASE_URL}/health`, { method: "POST" });
      assert.strictEqual(res.status, 404);
    });
  });
});
