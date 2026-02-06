import assert from "node:assert";
import { describe, it } from "node:test";
import { LocalIdentityProvider } from "../../../src/auth/providers/local.js";

describe("LocalIdentityProvider", () => {
  it("should have correct type and id", () => {
    const provider = new LocalIdentityProvider([]);
    assert.strictEqual(provider.type, "form");
    assert.strictEqual(provider.id, "local");
    assert.strictEqual(provider.name, "Local");
  });

  it("should validate correct credentials", async () => {
    const provider = new LocalIdentityProvider([
      { username: "alice", password: "secret123" },
    ]);

    const result = await provider.validate("alice", "secret123");
    assert.deepStrictEqual(result, {
      id: "local:alice",
      displayName: "alice",
    });
  });

  it("should reject wrong password", async () => {
    const provider = new LocalIdentityProvider([
      { username: "alice", password: "secret123" },
    ]);

    const result = await provider.validate("alice", "wrong");
    assert.strictEqual(result, null);
  });

  it("should reject unknown username", async () => {
    const provider = new LocalIdentityProvider([
      { username: "alice", password: "secret123" },
    ]);

    const result = await provider.validate("bob", "secret123");
    assert.strictEqual(result, null);
  });

  it("should check multiple users", async () => {
    const provider = new LocalIdentityProvider([
      { username: "alice", password: "pass1" },
      { username: "bob", password: "pass2" },
    ]);

    const alice = await provider.validate("alice", "pass1");
    assert.deepStrictEqual(alice, { id: "local:alice", displayName: "alice" });

    const bob = await provider.validate("bob", "pass2");
    assert.deepStrictEqual(bob, { id: "local:bob", displayName: "bob" });
  });
});
