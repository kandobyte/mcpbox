import { z } from "zod";

/**
 * API key format: 16-128 characters, alphanumeric with hyphens and underscores.
 */
const ApiKeySchema = z
  .string()
  .min(16, "API key must be at least 16 characters")
  .max(128, "API key must be at most 128 characters")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "API key must contain only A-Z, a-z, 0-9, hyphens, and underscores",
  );

/**
 * MCP server entry (command + args + env)
 */
export const McpServerEntrySchema = z
  .object({
    command: z.string().min(1, "Command is required"),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    tools: z.array(z.string()).optional(),
  })
  .strict();

/**
 * OAuth user credentials
 */
export const OAuthUserSchema = z
  .object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

/**
 * OAuth client configuration
 */
export const OAuthClientSchema = z
  .object({
    client_id: z.string().min(1, "Client ID is required"),
    client_name: z.string().optional(),
    client_secret: z.string().optional(),
    redirect_uris: z.array(z.string().url("Invalid redirect URI")).optional(),
    grant_type: z.enum(["authorization_code", "client_credentials"]),
  })
  .strict()
  .refine(
    (client) => {
      // client_credentials requires client_secret
      if (client.grant_type === "client_credentials" && !client.client_secret) {
        return false;
      }
      return true;
    },
    {
      message: "client_secret is required for client_credentials grant type",
    },
  )
  .refine(
    (client) => {
      // authorization_code requires redirect_uris
      if (
        client.grant_type === "authorization_code" &&
        (!client.redirect_uris || client.redirect_uris.length === 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message: "redirect_uris is required for authorization_code grant type",
    },
  );

/**
 * Auth config - discriminated union based on type
 */
export const AuthConfigSchema = z.discriminatedUnion("type", [
  // API key authentication
  z
    .object({
      type: z.literal("apikey"),
      apiKey: ApiKeySchema,
    })
    .strict(),

  // OAuth authentication
  z
    .object({
      type: z.literal("oauth"),
      issuer: z.string().url("Invalid issuer URL").optional(),
      users: z.array(OAuthUserSchema).optional(),
      clients: z.array(OAuthClientSchema).optional(),
      dynamic_registration: z.boolean().optional(),
    })
    .strict()
    .refine(
      (oauth) => {
        // Must have at least users, clients, or dynamic_registration
        const hasUsers = oauth.users && oauth.users.length > 0;
        const hasClients = oauth.clients && oauth.clients.length > 0;
        const hasDynamicReg = oauth.dynamic_registration === true;
        return hasUsers || hasClients || hasDynamicReg;
      },
      {
        message:
          "OAuth requires at least one of: users, clients, or dynamic_registration enabled",
      },
    ),
]);

/**
 * Server configuration
 */
export const ServerConfigSchema = z
  .object({
    port: z
      .number()
      .int()
      .min(1, "Port must be at least 1")
      .max(65535, "Port must be at most 65535")
      .default(8080),
  })
  .strict();

/**
 * Log configuration
 */
export const LogConfigSchema = z
  .object({
    level: z.enum(["debug", "info", "warn", "error"]).optional(),
    format: z.enum(["pretty", "json"]).optional(),
    redactSecrets: z.boolean().optional(),
    mcpDebug: z.boolean().optional(),
  })
  .strict();

/**
 * Storage configuration - discriminated union based on type
 */
export const StorageConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("memory") }).strict(),
  z
    .object({
      type: z.literal("sqlite"),
      path: z.string().optional(),
    })
    .strict(),
]);

/**
 * Raw config file schema (before processing)
 */
export const RawConfigSchema = z
  .object({
    server: ServerConfigSchema.optional(),
    auth: AuthConfigSchema.optional(),
    storage: StorageConfigSchema.optional(),
    log: LogConfigSchema.optional(),
    mcpServers: z.record(z.string(), McpServerEntrySchema).optional(),
  })
  .strict();

/**
 * Internal MCP config (with name resolved from key)
 */
export const McpConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  tools: z.array(z.string()).optional(),
});

/**
 * Processed config (after loader adds defaults and resolves mcpServers)
 */
export const ConfigSchema = z.object({
  server: ServerConfigSchema,
  auth: AuthConfigSchema.optional(),
  storage: StorageConfigSchema.optional(),
  log: LogConfigSchema.optional(),
  mcps: z.array(McpConfigSchema),
});

// Export inferred types
export type McpServerEntry = z.infer<typeof McpServerEntrySchema>;
export type OAuthUser = z.infer<typeof OAuthUserSchema>;
export type OAuthClient = z.infer<typeof OAuthClientSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type LogConfig = z.infer<typeof LogConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type RawConfig = z.infer<typeof RawConfigSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
