import { logger } from "../logger.js";
import type {
  StateStore,
  StoredAccessToken,
  StoredClient,
  StoredRefreshToken,
} from "./types.js";

export class MemoryStore implements StateStore {
  private clients = new Map<string, StoredClient>();
  private accessTokens = new Map<string, StoredAccessToken>();
  private refreshTokens = new Map<string, StoredRefreshToken>();

  constructor() {
    logger.info(
      "Memory store initialized (state will not persist across restarts)",
    );
  }

  // Client operations
  getClient(clientId: string): StoredClient | null {
    return this.clients.get(clientId) ?? null;
  }

  saveClient(client: StoredClient): void {
    this.clients.set(client.clientId, client);
  }

  deleteClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getAllDynamicClients(): StoredClient[] {
    return Array.from(this.clients.values()).filter((c) => c.isDynamic);
  }

  // Access token operations
  getAccessToken(token: string): StoredAccessToken | null {
    const stored = this.accessTokens.get(token);
    if (!stored) return null;
    if (stored.expiresAt < Date.now()) {
      this.accessTokens.delete(token);
      return null;
    }
    return stored;
  }

  saveAccessToken(token: StoredAccessToken): void {
    this.accessTokens.set(token.token, token);
  }

  deleteAccessToken(token: string): void {
    this.accessTokens.delete(token);
  }

  // Refresh token operations
  getRefreshToken(token: string): StoredRefreshToken | null {
    const stored = this.refreshTokens.get(token);
    if (!stored) return null;
    if (stored.expiresAt < Date.now()) {
      this.refreshTokens.delete(token);
      return null;
    }
    return stored;
  }

  saveRefreshToken(token: StoredRefreshToken): void {
    this.refreshTokens.set(token.token, token);
  }

  deleteRefreshToken(token: string): void {
    this.refreshTokens.delete(token);
  }

  rotateRefreshToken(oldTokenHash: string, newToken: StoredRefreshToken): void {
    this.refreshTokens.delete(oldTokenHash);
    this.refreshTokens.set(newToken.token, newToken);
  }

  close(): void {
    // Nothing to close for memory store
  }
}
