#!/usr/bin/env node
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
/**
 * MCP Conformance Test Server
 *
 * A minimal MCP server that implements the fixtures required by the
 * @modelcontextprotocol/conformance test suite. This server is used
 * as a downstream MCP server for MCPBox during conformance testing.
 */
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "conformance-test-server",
  version: "1.0.0",
});

// 1x1 transparent PNG
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Minimal WAV file (44 bytes header + 1 sample)
const TINY_WAV_BASE64 =
  "UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==";

// --- Tools ---

server.tool("test_simple_text", "Returns simple text content", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: "This is a simple text response for testing.",
      },
    ],
  };
});

server.tool("test_image_content", "Returns image content", {}, async () => {
  return {
    content: [
      {
        type: "image",
        data: TINY_PNG_BASE64,
        mimeType: "image/png",
      },
    ],
  };
});

server.tool("test_audio_content", "Returns audio content", {}, async () => {
  return {
    content: [
      {
        type: "audio",
        data: TINY_WAV_BASE64,
        mimeType: "audio/wav",
      },
    ],
  };
});

server.tool(
  "test_embedded_resource",
  "Returns embedded resource content",
  {},
  async () => {
    return {
      content: [
        {
          type: "resource",
          resource: {
            uri: "test://embedded-resource",
            mimeType: "text/plain",
            text: "Embedded resource content",
          },
        },
      ],
    };
  },
);

server.tool(
  "test_multiple_content_types",
  "Returns multiple content types",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: "Multiple content types test:",
        },
        {
          type: "image",
          data: TINY_PNG_BASE64,
          mimeType: "image/png",
        },
        {
          type: "resource",
          resource: {
            uri: "test://mixed-content-resource",
            mimeType: "application/json",
            text: '{"test":"data","value":123}',
          },
        },
      ],
    };
  },
);

server.tool(
  "test_tool_with_logging",
  "Tool that uses logging",
  {},
  async () => {
    // Note: Logging requires server-side notification support
    // For now, just return success
    return {
      content: [
        {
          type: "text",
          text: "Tool executed with logging",
        },
      ],
    };
  },
);

server.tool(
  "test_error_handling",
  "Tool that returns an error",
  {},
  async () => {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "This is an expected error for testing",
        },
      ],
    };
  },
);

server.tool(
  "test_tool_with_progress",
  "Tool that reports progress",
  {},
  async () => {
    // Note: Progress requires server-side notification support
    // For now, just return success
    return {
      content: [
        {
          type: "text",
          text: "Tool completed with progress",
        },
      ],
    };
  },
);

server.tool("test_sampling", "Tool that uses sampling", {}, async () => {
  // Note: Sampling requires client capability
  return {
    content: [
      {
        type: "text",
        text: "Sampling not supported",
      },
    ],
  };
});

server.tool("test_elicitation", "Tool that uses elicitation", {}, async () => {
  // Note: Elicitation requires client capability
  return {
    content: [
      {
        type: "text",
        text: "Elicitation not supported",
      },
    ],
  };
});

// --- Resources ---
// Signature: server.resource(name, uri, metadata?, callback)

server.resource(
  "Static text resource",
  "test://static-text",
  { mimeType: "text/plain" },
  async () => {
    return {
      contents: [
        {
          uri: "test://static-text",
          mimeType: "text/plain",
          text: "This is the content of the static text resource.",
        },
      ],
    };
  },
);

server.resource(
  "Static binary resource",
  "test://static-binary",
  { mimeType: "image/png" },
  async () => {
    return {
      contents: [
        {
          uri: "test://static-binary",
          mimeType: "image/png",
          blob: TINY_PNG_BASE64,
        },
      ],
    };
  },
);

server.resource(
  "Embedded resource",
  "test://embedded-resource",
  { mimeType: "text/plain" },
  async () => {
    return {
      contents: [
        {
          uri: "test://embedded-resource",
          mimeType: "text/plain",
          text: "Embedded resource content",
        },
      ],
    };
  },
);

// Resource template - conformance expects test://template/{id}/data
server.resource(
  "Template resource",
  new ResourceTemplate("test://template/{id}/data", { list: undefined }),
  { mimeType: "application/json" },
  async (uri, params) => {
    const id = params.id as string;
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            id,
            templateTest: true,
            data: `Data for ID: ${id}`,
          }),
        },
      ],
    };
  },
);

// --- Prompts ---
// Signature: server.prompt(name, description?, argsSchema?, callback)

server.prompt("test_simple_prompt", "A simple test prompt", async () => {
  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: "This is a simple prompt for testing.",
        },
      },
    ],
  };
});

server.prompt(
  "test_prompt_with_arguments",
  "A prompt with arguments",
  {
    arg1: completable(
      z.string().describe("First test argument"),
      async (value) => {
        // Return suggestions that start with the partial value
        const options = ["paris", "park", "party", "parrot", "partial"];
        return options.filter((opt) => opt.startsWith(value.toLowerCase()));
      },
    ),
    arg2: z.string().describe("Second test argument"),
  },
  async (args) => {
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Prompt with arguments: arg1='${args.arg1}', arg2='${args.arg2}'`,
          },
        },
      ],
    };
  },
);

server.prompt(
  "test_prompt_with_embedded_resource",
  "A prompt with embedded resource",
  async () => {
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "resource" as const,
            resource: {
              uri: "test://embedded-resource",
              mimeType: "text/plain",
              text: "Embedded resource in prompt",
            },
          },
        },
      ],
    };
  },
);

server.prompt("test_prompt_with_image", "A prompt with image", async () => {
  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "image" as const,
          data: TINY_PNG_BASE64,
          mimeType: "image/png",
        },
      },
    ],
  };
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
