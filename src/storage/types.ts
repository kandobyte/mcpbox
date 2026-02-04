// Types for persisted OAuth state

export interface StoredClient {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris?: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  created_at: number;
  is_dynamic: boolean;
}

export interface StoredAccessToken {
  token: string;
  client_id: string;
  scope?: string;
  expires_at: number;
  user_id: string;
}

export interface StoredRefreshToken {
  token: string;
  client_id: string;
  scope?: string;
  expires_at: number;
  user_id: string;
}

/**
 * Interface for state storage backends.
 *
 * Methods return null when an entity is not found.
 * Implementations should throw on actual errors (connection failures, etc.).
 */
export interface StateStore {
  // Client operations
  getClient(clientId: string): StoredClient | null;
  saveClient(client: StoredClient): void;
  deleteClient(clientId: string): void;
  getAllDynamicClients(): StoredClient[];

  // Access token operations
  getAccessToken(token: string): StoredAccessToken | null;
  saveAccessToken(token: StoredAccessToken): void;
  deleteAccessToken(token: string): void;

  // Refresh token operations
  getRefreshToken(token: string): StoredRefreshToken | null;
  saveRefreshToken(token: StoredRefreshToken): void;
  deleteRefreshToken(token: string): void;
  rotateRefreshToken(oldTokenHash: string, newToken: StoredRefreshToken): void;

  // Cleanup expired tokens
  cleanupExpired(): void;

  // Close/cleanup resources (may be async for stores that need to persist data)
  close(): void | Promise<void>;
}
