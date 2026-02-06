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
 * @package
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
 * @package
 */
export const OAuthUserSchema = z
  .object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

/**
 * Local identity provider — users defined in config.
 * @package
 */
export const LocalIdPSchema = z
  .object({
    type: z.literal("local"),
    users: z.array(OAuthUserSchema).min(1, "At least one user is required"),
  })
  .strict();

/**
 * GitHub identity provider — OAuth web flow.
 * @package
 */
export const GitHubIdPSchema = z
  .object({
    type: z.literal("github"),
    clientId: z.string().min(1, "GitHub clientId is required"),
    clientSecret: z.string().min(1, "GitHub clientSecret is required"),
    allowedOrgs: z.array(z.string()).optional(),
    allowedUsers: z.array(z.string()).optional(),
  })
  .strict();

/**
 * Identity provider configuration — discriminated union.
 * @package
 */
export const IdentityProviderSchema = z.discriminatedUnion("type", [
  LocalIdPSchema,
  GitHubIdPSchema,
]);

/**
 * OAuth client configuration
 * @package
 */
export const OAuthClientSchema = z
  .object({
    clientId: z.string().min(1, "Client ID is required"),
    clientName: z.string().optional(),
    clientSecret: z.string().optional(),
    redirectUris: z.array(z.string().url("Invalid redirect URI")).optional(),
    grantType: z.enum(["authorization_code", "client_credentials"]),
  })
  .strict()
  .refine(
    (client) => {
      // client_credentials requires clientSecret
      if (client.grantType === "client_credentials" && !client.clientSecret) {
        return false;
      }
      return true;
    },
    {
      message: "clientSecret is required for client_credentials grant type",
    },
  )
  .refine(
    (client) => {
      // authorization_code requires redirectUris
      if (
        client.grantType === "authorization_code" &&
        (!client.redirectUris || client.redirectUris.length === 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message: "redirectUris is required for authorization_code grant type",
    },
  );

/**
 * Auth config - discriminated union based on type
 * @package
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
      identityProviders: z.array(IdentityProviderSchema).optional(),
      clients: z.array(OAuthClientSchema).optional(),
      dynamicRegistration: z.boolean().optional(),
    })
    .strict()
    .refine(
      (oauth) => {
        const hasProviders =
          oauth.identityProviders && oauth.identityProviders.length > 0;
        const hasClients = oauth.clients && oauth.clients.length > 0;
        const hasDynamicReg = oauth.dynamicRegistration === true;
        return hasProviders || hasClients || hasDynamicReg;
      },
      {
        message:
          "OAuth requires at least one of: identity providers, clients, or dynamic registration enabled",
      },
    )
    .refine(
      (oauth) => {
        // dynamicRegistration requires at least one identity provider for user login
        if (!oauth.dynamicRegistration) return true;
        return oauth.identityProviders && oauth.identityProviders.length > 0;
      },
      {
        message:
          "dynamic registration requires identity providers to be configured for user login",
      },
    ),
]);

/**
 * Server configuration
 * @package
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
 * @package
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
 * @package
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
 * @package
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
 * @package
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
 * @package
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
export type IdentityProviderConfig = z.infer<typeof IdentityProviderSchema>;
export type LocalIdPConfig = z.infer<typeof LocalIdPSchema>;
export type GitHubIdPConfig = z.infer<typeof GitHubIdPSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type LogConfig = z.infer<typeof LogConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type RawConfig = z.infer<typeof RawConfigSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export interface LoadConfigResult {
  config: Config;
  warnings: string[];
}
