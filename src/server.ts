import path from "node:path";
import { serve } from "@hono/node-server";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { type Context, Hono } from "hono";
import { LOGO_PNG_BASE64 } from "./assets.js";
import { checkApiKey } from "./auth/apikey.js";
import { OAuthServer } from "./auth/oauth.js";
import type { Config } from "./config/types.js";
import { logger } from "./logger.js";
import {
  handleCompletionComplete,
  handleInitialize,
  handleInitialized,
  handleMethodNotFound,
  handlePing,
  handlePromptsGet,
  handlePromptsList,
  handleResourcesList,
  handleResourcesRead,
  handleToolsCall,
  handleToolsList,
} from "./mcp/handlers.js";
import { McpManager } from "./mcp/manager.js";
import { MemoryStore } from "./storage/memory.js";
import { SqliteStore } from "./storage/sqlite.js";
import type { StateStore } from "./storage/types.js";

const LOGO_PNG = Buffer.from(LOGO_PNG_BASE64, "base64");

async function createStore(config: Config): Promise<StateStore> {
  if (config.storage?.type === "sqlite") {
    const dbPath =
      config.storage.path ?? path.join(process.cwd(), "data", "mcpbox.db");
    return SqliteStore.create(dbPath);
  }
  return new MemoryStore();
}

export async function createServer(config: Config) {
  // Start MCP servers
  const mcpManager = new McpManager(config.log);
  await mcpManager.start(config.mcps);

  // Set up authentication
  const auth = config.auth;
  let apiKey: string | undefined;
  let oauthServer: OAuthServer | null = null;
  let store: StateStore | null = null;

  if (auth?.type === "apikey") {
    apiKey = auth.apiKey;
  } else if (auth?.type === "oauth") {
    store = await createStore(config);
    oauthServer = new OAuthServer(
      {
        issuer: auth.issuer ?? `http://localhost:${config.server.port}`,
        users: auth.users,
        clients: auth.clients,
        dynamicRegistration: auth.dynamic_registration,
      },
      store,
    );
  }

  const app = new Hono();

  // Request logging middleware (applies to all routes)
  app.use("*", async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const pathname = new URL(c.req.url).pathname;

    logger.debug({ method, path: pathname }, "Request received");

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    logger.debug(
      { method, path: pathname, status, duration: `${duration}ms` },
      "Request completed",
    );
  });

  // --- Public routes (no auth required) ---

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/logo.png", (c) => {
    c.header("Content-Type", "image/png");
    return c.body(LOGO_PNG);
  });
  app.get("/favicon.ico", (c) => {
    c.header("Content-Type", "image/png");
    return c.body(LOGO_PNG);
  });
  app.get("/icon.png", (c) => {
    c.header("Content-Type", "image/png");
    return c.body(LOGO_PNG);
  });
  app.get("/favicon.png", (c) => {
    c.header("Content-Type", "image/png");
    return c.body(LOGO_PNG);
  });

  if (oauthServer) {
    // RFC 9728: Protected Resource Metadata
    app.get("/.well-known/oauth-protected-resource", (c) => {
      return c.json(oauthServer.getProtectedResourceMetadata());
    });

    // RFC 8414: Authorization Server Metadata
    app.get("/.well-known/oauth-authorization-server", (c) => {
      return c.json(oauthServer.getAuthorizationServerMetadata());
    });

    // Authorization endpoint
    app.get("/authorize", async (c) => {
      const query = new URL(c.req.url).searchParams;
      return oauthServer.handleAuthorize(c, query);
    });

    app.post("/authorize", async (c) => {
      const query = new URL(c.req.url).searchParams;
      const body = await c.req.text();
      return oauthServer.handleAuthorize(c, query, body);
    });

    // Token endpoint
    app.post("/token", async (c) => {
      const body = await c.req.text();
      return oauthServer.handleToken(c, body);
    });

    // Dynamic Client Registration endpoint (RFC 7591)
    app.post("/register", async (c) => {
      const body = await c.req.text();
      return oauthServer.handleRegister(c, body);
    });
  }

  // --- Protected routes (auth required) ---

  const protectedRoutes = new Hono();

  // Auth middleware for protected routes
  protectedRoutes.use("*", async (c, next) => {
    if (apiKey) {
      const providedKey =
        c.req.header("x-api-key") ??
        c.req.header("authorization")?.replace(/^(Bearer|ApiKey)\s+/i, "");

      if (!checkApiKey(providedKey, apiKey)) {
        return c.json(
          { error: "Unauthorized: Invalid or missing API key" },
          401,
        );
      }
    } else if (oauthServer) {
      const authHeader = c.req.header("authorization");
      const validation = oauthServer.validateToken(authHeader);

      if (!validation.valid) {
        return oauthServer.sendUnauthorized(c, validation.error);
      }

      logger.debug({ userId: validation.userId }, "OAuth token validated");
    }

    return next();
  });

  // MCP handler
  const handleMcp = async (c: Context) => {
    let message: JSONRPCMessage;
    try {
      message = await c.req.json();
    } catch (e) {
      logger.warn(
        { error: e instanceof Error ? e.message : String(e) },
        "MCP parse error",
      );
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null,
        },
        400,
      );
    }

    const method = "method" in message ? message.method : undefined;
    const id = "id" in message ? message.id : undefined;
    logger.debug({ method, id }, "MCP request");

    if (method === "initialize") {
      return handleInitialize(c, message);
    }

    if (method === "notifications/initialized") {
      return handleInitialized(c);
    }

    if (method === "tools/list") {
      return handleToolsList(c, message, mcpManager);
    }

    if (method === "tools/call") {
      const params = (
        message as unknown as {
          params: { name: string; arguments?: Record<string, unknown> };
        }
      ).params;
      return handleToolsCall(c, message, mcpManager, params);
    }

    if (method === "resources/list") {
      return handleResourcesList(c, message, mcpManager);
    }

    if (method === "resources/read") {
      const params = (
        message as unknown as {
          params: { uri: string };
        }
      ).params;
      return handleResourcesRead(c, message, mcpManager, params);
    }

    if (method === "prompts/list") {
      return handlePromptsList(c, message, mcpManager);
    }

    if (method === "prompts/get") {
      const params = (
        message as unknown as {
          params: { name: string; arguments?: Record<string, string> };
        }
      ).params;
      return handlePromptsGet(c, message, mcpManager, params);
    }

    if (method === "ping") {
      return handlePing(c, message);
    }

    if (method === "completion/complete") {
      const params = (
        message as unknown as {
          params: {
            ref: { type: string; name?: string; uri?: string };
            argument: { name: string; value: string };
          };
        }
      ).params;
      return handleCompletionComplete(c, message, mcpManager, params);
    }

    return handleMethodNotFound(c, message, method ?? "unknown");
  };

  // Status endpoint (protected)
  protectedRoutes.get("/status", async (c) => {
    const health = await mcpManager.checkHealth();
    return c.json({ servers: health.servers });
  });

  // MCP endpoints (protected)
  protectedRoutes.post("/", handleMcp);
  protectedRoutes.post("/mcp", handleMcp);

  // Mount protected routes
  app.route("/", protectedRoutes);

  // 404 for other routes
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  // Error handler
  app.onError((err, c) => {
    logger.error({ error: err.message }, "Server error");
    return c.json({ error: "Internal server error" }, 500);
  });

  const server = serve(
    {
      fetch: app.fetch,
      port: config.server.port,
      hostname: "0.0.0.0",
    },
    () => {
      if (auth?.type === "apikey") {
        logger.info("Authentication: API key");
      } else if (auth?.type === "oauth") {
        const userCount = auth.users?.length ?? 0;
        const clientCount = auth.clients?.length ?? 0;
        const dynamicReg = auth.dynamic_registration ? "enabled" : "disabled";
        logger.info(
          {
            users: userCount,
            clients: clientCount,
            dynamicRegistration: dynamicReg,
          },
          "Authentication: OAuth",
        );
      }

      logger.info(
        { port: config.server.port, mcpCount: mcpManager.count },
        `mcpbox listening on port ${config.server.port}`,
      );
    },
  );

  return {
    server,
    mcpManager,
    async close() {
      logger.info("Shutting down mcpbox...");
      await mcpManager.stop();

      if (oauthServer) {
        oauthServer.close();
      }

      if (store) {
        await store.close();
      }

      return new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            logger.error({ error: err.message }, "Error closing server");
            reject(err);
          } else {
            logger.info("Server closed");
            resolve();
          }
        });
      });
    },
  };
}
