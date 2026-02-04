import assert from "node:assert";
import { describe, it } from "node:test";
import {
  hashSecret,
  isBcryptHash,
  isRedirectUriAllowed,
  parseBearerToken,
  verifyClientSecret,
  verifyPassword,
} from "../../../src/auth/oauth-utils.js";
import type { StoredClient } from "../../../src/storage/types.js";

describe("oauth-utils", () => {
  describe("hashSecret", () => {
    it("should return SHA-256 hex hash", () => {
      const result = hashSecret("test-secret");
      // SHA-256 produces 64 hex characters
      assert.strictEqual(result.length, 64);
      assert.match(result, /^[a-f0-9]+$/);
    });

    it("should produce consistent hashes", () => {
      const hash1 = hashSecret("my-secret");
      const hash2 = hashSecret("my-secret");
      assert.strictEqual(hash1, hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = hashSecret("secret1");
      const hash2 = hashSecret("secret2");
      assert.notStrictEqual(hash1, hash2);
    });

    it("should handle empty string", () => {
      const result = hashSecret("");
      assert.strictEqual(result.length, 64);
    });

    it("should handle unicode strings", () => {
      const result = hashSecret("密码🔐");
      assert.strictEqual(result.length, 64);
    });
  });

  describe("verifyClientSecret", () => {
    it("should return true for matching secret", () => {
      const secret = "my-client-secret";
      const storedHash = hashSecret(secret);
      assert.strictEqual(verifyClientSecret(secret, storedHash), true);
    });

    it("should return false for non-matching secret", () => {
      const storedHash = hashSecret("correct-secret");
      assert.strictEqual(verifyClientSecret("wrong-secret", storedHash), false);
    });

    it("should return false for empty input", () => {
      const storedHash = hashSecret("some-secret");
      assert.strictEqual(verifyClientSecret("", storedHash), false);
    });

    it("should be case-sensitive", () => {
      const storedHash = hashSecret("Secret");
      assert.strictEqual(verifyClientSecret("secret", storedHash), false);
    });
  });

  describe("isBcryptHash", () => {
    it("should return true for $2a$ bcrypt hash", () => {
      const bcryptHash =
        "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
      assert.strictEqual(isBcryptHash(bcryptHash), true);
    });

    it("should return true for $2b$ bcrypt hash", () => {
      const bcryptHash =
        "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4q6G1/EaT8kJZK/G";
      assert.strictEqual(isBcryptHash(bcryptHash), true);
    });

    it("should return false for plain text password", () => {
      assert.strictEqual(isBcryptHash("plainpassword"), false);
    });

    it("should return false for other hash formats", () => {
      // SHA-256 hash
      assert.strictEqual(
        isBcryptHash(
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        ),
        false,
      );
    });

    it("should return false for partial bcrypt prefix", () => {
      assert.strictEqual(isBcryptHash("$2a$"), false);
      assert.strictEqual(isBcryptHash("$2a$10"), false);
    });

    it("should return false for empty string", () => {
      assert.strictEqual(isBcryptHash(""), false);
    });
  });

  describe("verifyPassword", () => {
    it("should verify plain text password with timing-safe comparison", () => {
      assert.strictEqual(verifyPassword("password123", "password123"), true);
    });

    it("should reject non-matching plain text password", () => {
      assert.strictEqual(verifyPassword("wrong", "password123"), false);
    });

    it("should verify bcrypt hashed password", () => {
      // Pre-computed bcrypt hash for "testpassword" with cost 10
      const bcryptHash =
        "$2a$10$KEwI2TJ.Fe5EFzy73Whoe.4V6.Rb9FBqLXVDZDRnzgdAjyfePZ6A.";
      assert.strictEqual(verifyPassword("testpassword", bcryptHash), true);
    });

    it("should reject wrong password against bcrypt hash", () => {
      const bcryptHash =
        "$2a$10$KEwI2TJ.Fe5EFzy73Whoe.4V6.Rb9FBqLXVDZDRnzgdAjyfePZ6A.";
      assert.strictEqual(verifyPassword("wrongpassword", bcryptHash), false);
    });

    it("should be case-sensitive for plain text", () => {
      assert.strictEqual(verifyPassword("Password", "password"), false);
    });
  });

  describe("isRedirectUriAllowed", () => {
    const createClient = (redirect_uris?: string[]): StoredClient => ({
      client_id: "test-client",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      created_at: Date.now(),
      is_dynamic: false,
      redirect_uris,
    });

    it("should return true for exact match", () => {
      const client = createClient(["https://example.com/callback"]);
      assert.strictEqual(
        isRedirectUriAllowed("https://example.com/callback", client),
        true,
      );
    });

    it("should return false for non-matching URI", () => {
      const client = createClient(["https://example.com/callback"]);
      assert.strictEqual(
        isRedirectUriAllowed("https://other.com/callback", client),
        false,
      );
    });

    it("should return false for partial match", () => {
      const client = createClient(["https://example.com/callback"]);
      assert.strictEqual(
        isRedirectUriAllowed("https://example.com/callback/extra", client),
        false,
      );
    });

    it("should return false for path traversal attempt", () => {
      const client = createClient(["https://example.com/callback"]);
      assert.strictEqual(
        isRedirectUriAllowed("https://example.com/callback/../other", client),
        false,
      );
    });

    it("should match one of multiple allowed URIs", () => {
      const client = createClient([
        "https://example.com/callback1",
        "https://example.com/callback2",
      ]);
      assert.strictEqual(
        isRedirectUriAllowed("https://example.com/callback2", client),
        true,
      );
    });

    it("should return false for empty redirect_uris", () => {
      const client = createClient([]);
      assert.strictEqual(
        isRedirectUriAllowed("https://example.com/callback", client),
        false,
      );
    });

    it("should return false for undefined redirect_uris", () => {
      const client = createClient(undefined);
      assert.strictEqual(
        isRedirectUriAllowed("https://example.com/callback", client),
        false,
      );
    });

    it("should be case-sensitive", () => {
      const client = createClient(["https://Example.com/Callback"]);
      assert.strictEqual(
        isRedirectUriAllowed("https://example.com/callback", client),
        false,
      );
    });
  });

  describe("parseBearerToken", () => {
    it("should extract token from valid Bearer header", () => {
      assert.strictEqual(parseBearerToken("Bearer abc123xyz"), "abc123xyz");
    });

    it("should be case-insensitive for Bearer prefix", () => {
      assert.strictEqual(parseBearerToken("bearer token123"), "token123");
      assert.strictEqual(parseBearerToken("BEARER token123"), "token123");
      assert.strictEqual(parseBearerToken("BeArEr token123"), "token123");
    });

    it("should return null for missing header", () => {
      assert.strictEqual(parseBearerToken(undefined), null);
    });

    it("should return null for empty string", () => {
      assert.strictEqual(parseBearerToken(""), null);
    });

    it("should return null for non-Bearer scheme", () => {
      assert.strictEqual(parseBearerToken("Basic dXNlcjpwYXNz"), null);
    });

    it("should return null for malformed Bearer header", () => {
      assert.strictEqual(parseBearerToken("Bearer"), null);
      assert.strictEqual(parseBearerToken("Bearer "), null);
    });

    it("should handle token with special characters", () => {
      assert.strictEqual(
        parseBearerToken("Bearer abc-123_xyz.456"),
        "abc-123_xyz.456",
      );
    });

    it("should handle multiple spaces after Bearer", () => {
      // The regex \s+ consumes all whitespace, so "Bearer   token" -> "token"
      const result = parseBearerToken("Bearer   token");
      assert.strictEqual(result, "token");
    });
  });
});
