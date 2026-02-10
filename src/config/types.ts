// Re-export all types from schema (types are now inferred from Zod schemas)
export type {
  AuthConfig,
  Config,
  GitHubIdPConfig,
  IdentityProviderConfig,
  LocalIdPConfig,
  LogConfig,
  McpConfig,
  McpServerEntry,
  OAuthClient,
  OAuthUser,
  ServerConfig,
  StorageConfig,
} from "./schema.js";
