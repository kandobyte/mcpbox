import assert from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { MemoryStore } from "../../../src/storage/memory.js";
import {
  createDynamicClient,
  createTestAccessToken,
  createTestClient,
  createTestRefreshToken,
} from "../../helpers/index.js";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
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

    it("should overwrite existing client on save", () => {
      const client1 = createTestClient({
        clientId: "overwrite",
        clientName: "Original",
      });
      const client2 = createTestClient({
        clientId: "overwrite",
        clientName: "Updated",
      });

      store.saveClient(client1);
      store.saveClient(client2);

      const retrieved = store.getClient("overwrite");
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

    it("should return empty array when no dynamic clients", () => {
      const staticClient = createTestClient({ isDynamic: false });
      store.saveClient(staticClient);

      const dynamicClients = store.getAllDynamicClients();
      assert.deepStrictEqual(dynamicClients, []);
    });
  });

  describe("Access Token Operations", () => {
    it("should save and retrieve an access token", () => {
      const token = createTestAccessToken({ token: "access-1" });
      store.saveAccessToken(token);

      const retrieved = store.getAccessToken("access-1");
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

    it("should handle tokens with optional scope", () => {
      const tokenWithScope = createTestAccessToken({ scope: "read write" });
      const tokenWithoutScope = createTestAccessToken({
        token: "no-scope",
        scope: undefined,
      });

      store.saveAccessToken(tokenWithScope);
      store.saveAccessToken(tokenWithoutScope);

      const withScope = store.getAccessToken(tokenWithScope.token);
      const withoutScope = store.getAccessToken("no-scope");

      assert.strictEqual(withScope?.scope, "read write");
      assert.strictEqual(withoutScope?.scope, undefined);
    });
  });

  describe("Refresh Token Operations", () => {
    it("should save and retrieve a refresh token", () => {
      const token = createTestRefreshToken({ token: "refresh-1" });
      store.saveRefreshToken(token);

      const retrieved = store.getRefreshToken("refresh-1");
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

  describe("Close", () => {
    it("should handle close without error", () => {
      // MemoryStore.close() is a no-op, but should not throw
      store.close();
    });
  });
});
