// Re-export all types from schema (types are now inferred from Zod schemas)
export type {
  AuthConfig,
  Config,
  LogConfig,
  McpConfig,
  McpServerEntry,
  OAuthClient,
  OAuthUser,
  ServerConfig,
  StorageConfig,
} from "./schema.js";

// Also export GrantType for backwards compatibility
export type GrantType = "authorization_code" | "client_credentials";

// Legacy type alias
export type McpServersConfig = {
  mcpServers: Record<string, import("./schema.js").McpServerEntry>;
};
