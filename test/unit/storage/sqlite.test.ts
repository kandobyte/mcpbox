import assert from "node:assert";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { SqliteStore } from "../../../src/storage/sqlite.js";
import {
  createDynamicClient,
  createExpiredAccessToken,
  createExpiredRefreshToken,
  createM2MClient,
  createTestAccessToken,
  createTestClient,
  createTestRefreshToken,
} from "../../helpers/index.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-sqlite");

describe("SqliteStore", () => {
  let store: SqliteStore;
  let dbPath: string;

  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    try {
      rmSync(TEST_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Use unique db path for each test to ensure isolation
    dbPath = join(
      TEST_DIR,
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    store = await SqliteStore.create(dbPath);
  });

  afterEach(() => {
    try {
      store?.close();
    } catch {
      // Already closed by test
    }
  });

  describe("Initialization", () => {
    it("should create database file", async () => {
      assert.ok(existsSync(dbPath));
    });

    it("should open existing database", async () => {
      const client = createTestClient({ clientId: "persist-test" });
      store.saveClient(client);
      store.close();

      // Reopen the database
      const store2 = await SqliteStore.create(dbPath);
      const retrieved = store2.getClient("persist-test");

      assert.strictEqual(retrieved?.clientId, "persist-test");
      store2.close();
    });
  });

  describe("Client Operations", () => {
    it("should save and retrieve a client", () => {
      const client = createTestClient({ clientId: "test-1" });
      store.saveClient(client);

      const retrieved = store.getClient("test-1");
      assert.deepStrictEqual(retrieved, client);
    });

    it("should return null for non-existent client", () => {
      const result = store.getClient("non-existent");
      assert.strictEqual(result, null);
    });

    it("should delete a client", () => {
      const client = createTestClient({ clientId: "test-delete" });
      store.saveClient(client);

      store.deleteClient("test-delete");

      const result = store.getClient("test-delete");
      assert.strictEqual(result, null);
    });

    it("should update existing client on save", () => {
      const client1 = createTestClient({
        clientId: "update-test",
        clientName: "Original",
      });
      const client2 = createTestClient({
        clientId: "update-test",
        clientName: "Updated",
      });

      store.saveClient(client1);
      store.saveClient(client2);

      const retrieved = store.getClient("update-test");
      assert.strictEqual(retrieved?.clientName, "Updated");
    });

    it("should get all dynamic clients", () => {
      const static1 = createTestClient({
        clientId: "static-1",
        isDynamic: false,
      });
      const dynamic1 = createDynamicClient({ clientId: "dynamic-1" });
      const dynamic2 = createDynamicClient({ clientId: "dynamic-2" });

      store.saveClient(static1);
      store.saveClient(dynamic1);
      store.saveClient(dynamic2);

      const dynamicClients = store.getAllDynamicClients();
      assert.strictEqual(dynamicClients.length, 2);

      const ids = dynamicClients.map((c) => c.clientId);
      assert.ok(ids.includes("dynamic-1"));
      assert.ok(ids.includes("dynamic-2"));
      assert.ok(!ids.includes("static-1"));
    });

    it("should handle client without redirectUris", () => {
      const client = createM2MClient({ clientId: "m2m-test" });
      store.saveClient(client);

      const retrieved = store.getClient("m2m-test");
      assert.strictEqual(retrieved?.redirectUris, undefined);
    });

    it("should handle client with multiple redirectUris", () => {
      const client = createTestClient({
        clientId: "multi-uri",
        redirectUris: ["http://localhost:3000/a", "http://localhost:3000/b"],
      });
      store.saveClient(client);

      const retrieved = store.getClient("multi-uri");
      assert.deepStrictEqual(retrieved?.redirectUris, [
        "http://localhost:3000/a",
        "http://localhost:3000/b",
      ]);
    });

    it("should handle client with multiple grantTypes", () => {
      const client = createTestClient({
        clientId: "multi-grant",
        grantTypes: ["authorization_code", "refresh_token"],
      });
      store.saveClient(client);

      const retrieved = store.getClient("multi-grant");
      assert.deepStrictEqual(retrieved?.grantTypes, [
        "authorization_code",
        "refresh_token",
      ]);
    });
  });

  describe("Access Token Operations", () => {
    it("should save and retrieve an access token (hashed storage)", () => {
      const token = createTestAccessToken({ token: "access-token-123" });
      store.saveAccessToken(token);

      const retrieved = store.getAccessToken("access-token-123");
      assert.deepStrictEqual(retrieved, token);
    });

    it("should return null for non-existent access token", () => {
      const result = store.getAccessToken("non-existent");
      assert.strictEqual(result, null);
    });

    it("should delete an access token", () => {
      const token = createTestAccessToken({ token: "delete-me" });
      store.saveAccessToken(token);

      store.deleteAccessToken("delete-me");

      const result = store.getAccessToken("delete-me");
      assert.strictEqual(result, null);
    });

    it("should return original token, not hash", () => {
      const originalToken = "my-secret-access-token";
      const token = createTestAccessToken({ token: originalToken });
      store.saveAccessToken(token);

      const retrieved = store.getAccessToken(originalToken);
      assert.strictEqual(retrieved?.token, originalToken);
    });

    it("should handle tokens with optional scope", () => {
      const tokenWithScope = createTestAccessToken({
        token: "with-scope",
        scope: "read write",
      });
      const tokenWithoutScope = createTestAccessToken({
        token: "without-scope",
        scope: undefined,
      });

      store.saveAccessToken(tokenWithScope);
      store.saveAccessToken(tokenWithoutScope);

      const withScope = store.getAccessToken("with-scope");
      const withoutScope = store.getAccessToken("without-scope");

      assert.strictEqual(withScope?.scope, "read write");
      // SQLite returns null for NULL columns
      assert.ok(
        withoutScope?.scope === undefined || withoutScope?.scope === null,
      );
    });
  });

  describe("Refresh Token Operations", () => {
    it("should save and retrieve a refresh token (hashed storage)", () => {
      const token = createTestRefreshToken({ token: "refresh-token-123" });
      store.saveRefreshToken(token);

      const retrieved = store.getRefreshToken("refresh-token-123");
      assert.deepStrictEqual(retrieved, token);
    });

    it("should return null for non-existent refresh token", () => {
      const result = store.getRefreshToken("non-existent");
      assert.strictEqual(result, null);
    });

    it("should delete a refresh token", () => {
      const token = createTestRefreshToken({ token: "delete-me" });
      store.saveRefreshToken(token);

      store.deleteRefreshToken("delete-me");

      const result = store.getRefreshToken("delete-me");
      assert.strictEqual(result, null);
    });

    it("should rotate refresh token atomically", () => {
      const oldToken = createTestRefreshToken({ token: "old-token" });
      store.saveRefreshToken(oldToken);

      const newToken = createTestRefreshToken({
        token: "new-token",
        userId: oldToken.userId,
      });
      store.rotateRefreshToken("old-token", newToken);

      assert.strictEqual(store.getRefreshToken("old-token"), null);
      assert.deepStrictEqual(store.getRefreshToken("new-token"), newToken);
    });
  });

  describe("Cleanup Expired Tokens", () => {
    it("should remove expired access tokens", () => {
      const valid = createTestAccessToken({ token: "valid-access" });
      const expired = createExpiredAccessToken({ token: "expired-access" });

      store.saveAccessToken(valid);
      store.saveAccessToken(expired);

      store.cleanupExpired();

      assert.ok(store.getAccessToken("valid-access"));
      assert.strictEqual(store.getAccessToken("expired-access"), null);
    });

    it("should remove expired refresh tokens", () => {
      const valid = createTestRefreshToken({ token: "valid-refresh" });
      const expired = createExpiredRefreshToken({ token: "expired-refresh" });

      store.saveRefreshToken(valid);
      store.saveRefreshToken(expired);

      store.cleanupExpired();

      assert.ok(store.getRefreshToken("valid-refresh"));
      assert.strictEqual(store.getRefreshToken("expired-refresh"), null);
    });

    it("should handle cleanup when no tokens exist", () => {
      // Should not throw
      store.cleanupExpired();
    });

    it("should persist after cleanup", async () => {
      const expired = createExpiredAccessToken({ token: "expired" });
      store.saveAccessToken(expired);
      store.cleanupExpired();
      store.close();

      // Reopen and verify token is gone
      const store2 = await SqliteStore.create(dbPath);
      assert.strictEqual(store2.getAccessToken("expired"), null);
      store2.close();
    });
  });

  describe("Persistence", () => {
    it("should persist clients across restarts", async () => {
      const client = createTestClient({ clientId: "persist-client" });
      store.saveClient(client);
      store.close();

      const store2 = await SqliteStore.create(dbPath);
      const retrieved = store2.getClient("persist-client");
      assert.deepStrictEqual(retrieved, client);
      store2.close();
    });

    it("should persist tokens across restarts", async () => {
      const accessToken = createTestAccessToken({ token: "persist-access" });
      const refreshToken = createTestRefreshToken({ token: "persist-refresh" });

      store.saveAccessToken(accessToken);
      store.saveRefreshToken(refreshToken);
      store.close();

      const store2 = await SqliteStore.create(dbPath);
      assert.deepStrictEqual(
        store2.getAccessToken("persist-access"),
        accessToken,
      );
      assert.deepStrictEqual(
        store2.getRefreshToken("persist-refresh"),
        refreshToken,
      );
      store2.close();
    });
  });

  describe("Close", () => {
    it("should persist data on close", async () => {
      const client = createTestClient({ clientId: "close-test" });
      store.saveClient(client);
      store.close();

      const store2 = await SqliteStore.create(dbPath);
      const retrieved = store2.getClient("close-test");
      assert.ok(retrieved);
      store2.close();
    });
  });
});
