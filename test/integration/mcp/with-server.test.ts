import assert from "node:assert";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { mcpRequest, startServer, stopServer } from "../../helpers/index.js";

const PORT = 8085;
const BASE_URL = `http://localhost:${PORT}`;
const MOCK_SERVER_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "mcp-servers",
  "simple.ts",
);

const TEST_CONFIG = {
  server: { port: PORT },
  mcps: [
    {
      name: "mock",
      command: "npx",
      args: ["tsx", MOCK_SERVER_PATH],
    },
  ],
};

describe("MCP with Real Server", () => {
  before(async () => {
    await startServer(TEST_CONFIG);
    // Give MCP server time to initialize
    await new Promise((r) => setTimeout(r, 500));
  });

  after(async () => {
    await stopServer();
  });

  describe("tools/list", () => {
    it("should list tools from connected MCP server", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 1,
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      const tools = result.tools as Array<{ name: string }>;

      assert.ok(
        tools.length >= 3,
        `Expected at least 3 tools, got ${tools.length}`,
      );

      // Tools should be namespaced with "mock__" prefix
      const toolNames = tools.map((t) => t.name);
      assert.ok(
        toolNames.includes("mock__echo"),
        "Should have mock__echo tool",
      );
      assert.ok(toolNames.includes("mock__add"), "Should have mock__add tool");
      assert.ok(
        toolNames.includes("mock__fail"),
        "Should have mock__fail tool",
      );
    });
  });

  describe("tools/call", () => {
    it("should call echo tool and return result", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "tools/call",
        id: 2,
        params: {
          name: "mock__echo",
          arguments: { message: "Hello World" },
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      const content = result.content as Array<{ type: string; text: string }>;

      assert.strictEqual(content[0].type, "text");
      assert.strictEqual(content[0].text, "Echo: Hello World");
    });

    it("should call add tool with numeric arguments", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "tools/call",
        id: 3,
        params: {
          name: "mock__add",
          arguments: { a: 5, b: 3 },
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      const content = result.content as Array<{ type: string; text: string }>;

      assert.strictEqual(content[0].text, "8");
    });

    it("should handle tool that returns error", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "tools/call",
        id: 4,
        params: {
          name: "mock__fail",
          arguments: {},
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;

      assert.strictEqual(result.isError, true);
      const content = result.content as Array<{ type: string; text: string }>;
      assert.ok(content[0].text.includes("fails"));
    });
  });

  describe("resources/list", () => {
    it("should list resources from connected MCP server", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "resources/list",
        id: 5,
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      const resources = result.resources as Array<{ uri: string }>;

      assert.ok(resources.length >= 1, "Should have at least 1 resource");

      // Resources should be namespaced
      const uris = resources.map((r) => r.uri);
      assert.ok(
        uris.some((u) => u.startsWith("mock__")),
        "Resources should be namespaced",
      );
    });
  });

  describe("resources/read", () => {
    it("should read resource from connected MCP server", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "resources/read",
        id: 6,
        params: {
          uri: "mock__config://test",
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      const contents = result.contents as Array<{
        uri: string;
        mimeType: string;
        text: string;
      }>;

      assert.ok(contents.length > 0);
      const content = JSON.parse(contents[0].text);
      assert.strictEqual(content.setting, "value");
      assert.strictEqual(content.enabled, true);
    });
  });

  describe("prompts/list", () => {
    it("should list prompts from connected MCP server", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "prompts/list",
        id: 7,
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      const prompts = result.prompts as Array<{ name: string }>;

      assert.ok(prompts.length >= 1, "Should have at least 1 prompt");

      const names = prompts.map((p) => p.name);
      assert.ok(
        names.includes("mock__greeting"),
        "Should have mock__greeting prompt",
      );
    });
  });

  describe("prompts/get", () => {
    it("should get prompt from connected MCP server", async () => {
      const { status, json } = await mcpRequest(BASE_URL, {
        jsonrpc: "2.0",
        method: "prompts/get",
        id: 8,
        params: {
          name: "mock__greeting",
        },
      });

      assert.strictEqual(status, 200);
      const response = json as Record<string, unknown>;
      const result = response.result as Record<string, unknown>;
      const messages = result.messages as Array<{
        role: string;
        content: { type: string; text: string };
      }>;

      assert.ok(messages.length > 0);
      assert.strictEqual(messages[0].role, "user");
      assert.ok(messages[0].content.text.includes("Hello"));
    });
  });
});
