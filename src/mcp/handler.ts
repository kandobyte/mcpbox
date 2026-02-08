import type {
  InitializeResult,
  JSONRPCRequest,
} from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  InitializeRequestSchema,
  isJSONRPCNotification,
  JSONRPCRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  PingRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Context } from "hono";
import { logger } from "../logger.js";
import { NAME, VERSION } from "../version.js";
import type { McpManager } from "./manager.js";

function jsonrpcResult(id: string | number, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function jsonrpcError(id: string | number, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

export function createMcpHandler(mcpManager: McpManager) {
  return async (c: Context) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (e) {
      logger.warn(
        { error: e instanceof Error ? e.message : String(e) },
        "MCP parse error",
      );
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: ErrorCode.ParseError, message: "Parse error" },
          id: null,
        },
        400,
      );
    }

    if (isJSONRPCNotification(body)) {
      const method = body.method;
      logger.debug({ method }, "MCP notification");
      return c.body(null, 202);
    }

    const envelope = JSONRPCRequestSchema.safeParse(body);
    if (!envelope.success) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: ErrorCode.InvalidRequest,
            message: "Invalid request",
          },
          id: null,
        },
        400,
      );
    }

    const request = envelope.data;
    logger.debug({ method: request.method, id: request.id }, "MCP request");

    return handleRequest(c, request, mcpManager);
  };
}

async function handleRequest(
  c: Context,
  request: JSONRPCRequest,
  mcpManager: McpManager,
) {
  const { id, method } = request;

  if (method === "initialize") {
    const parsed = InitializeRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    const result: InitializeResult = {
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
    };
    return c.json(jsonrpcResult(id, result));
  }

  if (method === "ping") {
    const parsed = PingRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    return c.json(jsonrpcResult(id, {}));
  }

  if (method === "tools/list") {
    const parsed = ListToolsRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    return c.json(jsonrpcResult(id, { tools: mcpManager.listTools() }));
  }

  if (method === "tools/call") {
    const parsed = CallToolRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    try {
      const result = await mcpManager.callTool(parsed.data.params);
      return c.json(jsonrpcResult(id, result));
    } catch (error) {
      return c.json(
        jsonrpcError(
          id,
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Internal error",
        ),
      );
    }
  }

  if (method === "resources/list") {
    const parsed = ListResourcesRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    return c.json(jsonrpcResult(id, { resources: mcpManager.listResources() }));
  }

  if (method === "resources/read") {
    const parsed = ReadResourceRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    try {
      const result = await mcpManager.readResource(parsed.data.params);
      return c.json(jsonrpcResult(id, result));
    } catch (error) {
      return c.json(
        jsonrpcError(
          id,
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Internal error",
        ),
      );
    }
  }

  if (method === "prompts/list") {
    const parsed = ListPromptsRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    return c.json(jsonrpcResult(id, { prompts: mcpManager.listPrompts() }));
  }

  if (method === "prompts/get") {
    const parsed = GetPromptRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    try {
      const result = await mcpManager.getPrompt(parsed.data.params);
      return c.json(jsonrpcResult(id, result));
    } catch (error) {
      return c.json(
        jsonrpcError(
          id,
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Internal error",
        ),
      );
    }
  }

  if (method === "completion/complete") {
    const parsed = CompleteRequestSchema.safeParse(request);
    if (!parsed.success) {
      return c.json(
        jsonrpcError(id, ErrorCode.InvalidParams, "Invalid params"),
      );
    }
    try {
      const result = await mcpManager.complete(parsed.data.params);
      return c.json(jsonrpcResult(id, result));
    } catch (error) {
      return c.json(
        jsonrpcError(
          id,
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Internal error",
        ),
      );
    }
  }

  return c.json(
    jsonrpcError(id, ErrorCode.MethodNotFound, `Method not found: ${method}`),
  );
}
