#!/usr/bin/env node
/**
 * Simple mock MCP server for integration testing.
 * Implements minimal tools, resources, and prompts for testing MCPBox proxy behavior.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "mock-mcp-server",
  version: "1.0.0",
});

// Simple echo tool
server.tool(
  "echo",
  "Echoes back the input message",
  { message: z.string().describe("Message to echo") },
  async (args) => {
    return {
      content: [
        {
          type: "text",
          text: `Echo: ${args.message}`,
        },
      ],
    };
  },
);

// Tool that adds two numbers
server.tool(
  "add",
  "Adds two numbers",
  {
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  },
  async (args) => {
    return {
      content: [
        {
          type: "text",
          text: String(args.a + args.b),
        },
      ],
    };
  },
);

// Tool that returns an error
server.tool("fail", "Always fails", {}, async () => {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: "This tool always fails",
      },
    ],
  };
});

// Simple text resource
server.resource(
  "Test config",
  "config://test",
  { mimeType: "application/json" },
  async () => {
    return {
      contents: [
        {
          uri: "config://test",
          mimeType: "application/json",
          text: JSON.stringify({ setting: "value", enabled: true }),
        },
      ],
    };
  },
);

// Simple prompt
server.prompt("greeting", "A greeting prompt", async () => {
  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "Hello from mock MCP server!",
        },
      },
    ],
  };
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
