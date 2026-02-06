// Types for persisted OAuth state

export interface StoredClient {
  clientId: string;
  clientSecret?: string;
  clientName?: string;
  redirectUris?: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  createdAt: number;
  isDynamic: boolean;
}

export interface StoredAccessToken {
  token: string;
  clientId: string;
  scope?: string;
  expiresAt: number;
  userId: string;
}

export interface StoredRefreshToken {
  token: string;
  clientId: string;
  scope?: string;
  expiresAt: number;
  userId: string;
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

  // Close/cleanup resources (may be async for stores that need to persist data)
  close(): void | Promise<void>;
}
