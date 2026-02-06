// Suppress SQLite experimental warning - module is stable since Node 22.5 (stability 1.1)
// but still emits warning. See: https://github.com/nodejs/node/issues/58611
const originalEmit = process.emit;
// @ts-expect-error - patching emit to suppress sqlite warning
process.emit = (event, ...args) => {
  if (
    event === "warning" &&
    args[0]?.name === "ExperimentalWarning" &&
    args[0]?.message?.includes("SQLite")
  ) {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { logger } from "../logger.js";
import type {
  StateStore,
  StoredAccessToken,
  StoredClient,
  StoredRefreshToken,
} from "./types.js";

export class SqliteStore implements StateStore {
  private db: DatabaseSync;
  private cleanupInterval: ReturnType<typeof setInterval>;

  private constructor(db: DatabaseSync) {
    this.db = db;

    // Periodic cleanup of expired tokens (every 5 minutes)
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpired();
      },
      5 * 60 * 1000,
    );
    this.cleanupInterval.unref();
  }

  static create(dbPath: string): SqliteStore {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    const db = new DatabaseSync(dbPath);
    const store = new SqliteStore(db);
    store.initSchema();

    logger.info({ path: dbPath }, "SQLite store initialized");
    return store;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      )
    `);

    this.db.exec("CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv(expires_at)");
  }

  // Client operations
  getClient(clientId: string): StoredClient | null {
    const stmt = this.db.prepare("SELECT value FROM kv WHERE key = ?");
    const row = stmt.get(clientId) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  saveClient(client: StoredClient): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    );
    stmt.run(client.clientId, JSON.stringify(client));
  }

  deleteClient(clientId: string): void {
    const stmt = this.db.prepare("DELETE FROM kv WHERE key = ?");
    stmt.run(clientId);
  }

  getAllDynamicClients(): StoredClient[] {
    const stmt = this.db.prepare(
      "SELECT value FROM kv WHERE expires_at IS NULL",
    );
    const rows = stmt.all() as { value: string }[];
    return rows
      .map((row) => JSON.parse(row.value) as StoredClient)
      .filter((client) => client.isDynamic);
  }

  // Access token operations
  getAccessToken(token: string): StoredAccessToken | null {
    const stmt = this.db.prepare(
      "SELECT value FROM kv WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)",
    );
    const row = stmt.get(token, Date.now()) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  saveAccessToken(token: StoredAccessToken): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)",
    );
    stmt.run(token.token, JSON.stringify(token), token.expiresAt);
  }

  deleteAccessToken(token: string): void {
    const stmt = this.db.prepare("DELETE FROM kv WHERE key = ?");
    stmt.run(token);
  }

  // Refresh token operations
  getRefreshToken(token: string): StoredRefreshToken | null {
    const stmt = this.db.prepare(
      "SELECT value FROM kv WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)",
    );
    const row = stmt.get(token, Date.now()) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  saveRefreshToken(token: StoredRefreshToken): void {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)",
    );
    stmt.run(token.token, JSON.stringify(token), token.expiresAt);
  }

  deleteRefreshToken(token: string): void {
    const stmt = this.db.prepare("DELETE FROM kv WHERE key = ?");
    stmt.run(token);
  }

  rotateRefreshToken(oldTokenHash: string, newToken: StoredRefreshToken): void {
    this.db.exec("BEGIN");
    try {
      const deleteStmt = this.db.prepare("DELETE FROM kv WHERE key = ?");
      deleteStmt.run(oldTokenHash);

      const insertStmt = this.db.prepare(
        "INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)",
      );
      insertStmt.run(
        newToken.token,
        JSON.stringify(newToken),
        newToken.expiresAt,
      );

      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  // Cleanup expired tokens
  cleanupExpired(): void {
    const now = Date.now();

    const countStmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM kv WHERE expires_at IS NOT NULL AND expires_at < ?",
    );
    const count = (countStmt.get(now) as { count: number }).count;

    if (count > 0) {
      const deleteStmt = this.db.prepare(
        "DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at < ?",
      );
      deleteStmt.run(now);

      logger.debug({ expiredTokens: count }, "Cleaned up expired tokens");
    }
  }

  close(): void {
    clearInterval(this.cleanupInterval);
    this.db.close();
    logger.info("SQLite store closed");
  }
}
