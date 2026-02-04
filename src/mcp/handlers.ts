import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Context } from "hono";
import { NAME, VERSION } from "../version.js";
import type { McpManager } from "./manager.js";

function getMessageId(message: JSONRPCMessage): number | string | undefined {
  return "id" in message ? message.id : undefined;
}

export function handleInitialize(c: Context, message: JSONRPCMessage) {
  return c.json({
    jsonrpc: "2.0",
    id: getMessageId(message),
    result: {
      protocolVersion: "2025-11-25",
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
        completions: {},
      },
      serverInfo: {
        name: NAME,
        version: VERSION,
      },
    },
  });
}

export function handleInitialized(c: Context) {
  return c.body(null, 202);
}

export function handleToolsList(
  c: Context,
  message: JSONRPCMessage,
  mcpManager: McpManager,
) {
  const tools = mcpManager.listTools();
  return c.json({
    jsonrpc: "2.0",
    id: getMessageId(message),
    result: { tools },
  });
}

export async function handleToolsCall(
  c: Context,
  message: JSONRPCMessage,
  mcpManager: McpManager,
  params: { name: string; arguments?: Record<string, unknown> },
) {
  try {
    const result = await mcpManager.callTool(
      params.name,
      params.arguments ?? {},
    );
    return c.json({
      jsonrpc: "2.0",
      id: getMessageId(message),
      result,
    });
  } catch (error) {
    return c.json({
      jsonrpc: "2.0",
      id: getMessageId(message),
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  }
}

export function handlePing(c: Context, message: JSONRPCMessage) {
  return c.json({
    jsonrpc: "2.0",
    id: getMessageId(message),
    result: {},
  });
}

export function handleResourcesList(
  c: Context,
  message: JSONRPCMessage,
  mcpManager: McpManager,
) {
  const resources = mcpManager.listResources();
  return c.json({
    jsonrpc: "2.0",
    id: getMessageId(message),
    result: { resources },
  });
}

export async function handleResourcesRead(
  c: Context,
  message: JSONRPCMessage,
  mcpManager: McpManager,
  params: { uri: string },
) {
  try {
    const result = await mcpManager.readResource(params.uri);
    return c.json({
      jsonrpc: "2.0",
      id: getMessageId(message),
      result,
    });
  } catch (error) {
    return c.json({
      jsonrpc: "2.0",
      id: getMessageId(message),
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  }
}

export function handlePromptsList(
  c: Context,
  message: JSONRPCMessage,
  mcpManager: McpManager,
) {
  const prompts = mcpManager.listPrompts();
  return c.json({
    jsonrpc: "2.0",
    id: getMessageId(message),
    result: { prompts },
  });
}

export async function handlePromptsGet(
  c: Context,
  message: JSONRPCMessage,
  mcpManager: McpManager,
  params: { name: string; arguments?: Record<string, string> },
) {
  try {
    const result = await mcpManager.getPrompt(params.name, params.arguments);
    return c.json({
      jsonrpc: "2.0",
      id: getMessageId(message),
      result,
    });
  } catch (error) {
    return c.json({
      jsonrpc: "2.0",
      id: getMessageId(message),
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  }
}

export async function handleCompletionComplete(
  c: Context,
  message: JSONRPCMessage,
  mcpManager: McpManager,
  params: {
    ref: { type: string; name?: string; uri?: string };
    argument: { name: string; value: string };
  },
) {
  try {
    const result = await mcpManager.complete(params.ref, params.argument);
    return c.json({
      jsonrpc: "2.0",
      id: getMessageId(message),
      result,
    });
  } catch (error) {
    return c.json({
      jsonrpc: "2.0",
      id: getMessageId(message),
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  }
}

export function handleMethodNotFound(
  c: Context,
  message: JSONRPCMessage,
  method: string,
) {
  return c.json({
    jsonrpc: "2.0",
    id: getMessageId(message) ?? null,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}
