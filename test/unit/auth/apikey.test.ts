import assert from "node:assert";
import { describe, it } from "node:test";
import { checkApiKey } from "../../../src/auth/apikey.js";
import { TEST_API_KEY } from "../../helpers/index.js";

describe("checkApiKey", () => {
  describe("Valid API Keys", () => {
    it("should return true for matching API key", () => {
      assert.strictEqual(checkApiKey(TEST_API_KEY, TEST_API_KEY), true);
    });

    it("should return true for matching keys with allowed characters", () => {
      const key = "sk_live_abc123XYZ789";
      assert.strictEqual(checkApiKey(key, key), true);
    });
  });

  describe("Invalid API Keys", () => {
    it("should return false for non-matching API key", () => {
      assert.strictEqual(checkApiKey("wrong-key-1234567", TEST_API_KEY), false);
    });

    it("should return false for case-sensitive mismatch", () => {
      assert.strictEqual(
        checkApiKey("TEST-API-KEY-1234567", TEST_API_KEY),
        false,
      );
    });

    it("should return false for key with extra whitespace", () => {
      assert.strictEqual(checkApiKey(` ${TEST_API_KEY}`, TEST_API_KEY), false);
      assert.strictEqual(checkApiKey(`${TEST_API_KEY} `, TEST_API_KEY), false);
    });
  });

  describe("Missing or Undefined Keys", () => {
    it("should return false for undefined provided key", () => {
      assert.strictEqual(checkApiKey(undefined, TEST_API_KEY), false);
    });

    it("should return false for empty provided key", () => {
      assert.strictEqual(checkApiKey("", TEST_API_KEY), false);
    });
  });
});
