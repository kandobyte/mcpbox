import assert from "node:assert";
import { describe, it } from "node:test";
import { safeCompare } from "../../../src/auth/crypto.js";

describe("safeCompare", () => {
  describe("Equal Strings", () => {
    it("should return true for identical strings", () => {
      assert.strictEqual(safeCompare("password123", "password123"), true);
    });

    it("should return true for empty strings", () => {
      assert.strictEqual(safeCompare("", ""), true);
    });

    it("should return true for long identical strings", () => {
      const longString = "a".repeat(10000);
      assert.strictEqual(safeCompare(longString, longString), true);
    });

    it("should return true for strings with special characters", () => {
      const special = "p@$$w0rd!#%^&*()_+-=[]{}|;:',.<>?";
      assert.strictEqual(safeCompare(special, special), true);
    });

    it("should return true for unicode strings", () => {
      const unicode = "密码🔐пароль";
      assert.strictEqual(safeCompare(unicode, unicode), true);
    });
  });

  describe("Different Strings", () => {
    it("should return false for different strings of same length", () => {
      assert.strictEqual(safeCompare("password1", "password2"), false);
    });

    it("should return false for different strings of different length", () => {
      assert.strictEqual(safeCompare("short", "longer string"), false);
    });

    it("should return false when one string is empty", () => {
      assert.strictEqual(safeCompare("password", ""), false);
      assert.strictEqual(safeCompare("", "password"), false);
    });

    it("should return false for case differences", () => {
      assert.strictEqual(safeCompare("Password", "password"), false);
    });

    it("should return false for strings differing only at the end", () => {
      assert.strictEqual(safeCompare("password123", "password124"), false);
    });

    it("should return false for strings differing only at the start", () => {
      assert.strictEqual(safeCompare("Apassword", "Bpassword"), false);
    });
  });

  describe("Timing Safety", () => {
    it("should handle length mismatch without early return vulnerability", () => {
      // This is a behavioral test - actual timing would need specialized tools
      // The implementation should still perform a comparison even on length mismatch
      const result1 = safeCompare("short", "very long string here");
      const result2 = safeCompare("a", "b");

      assert.strictEqual(result1, false);
      assert.strictEqual(result2, false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle strings with null bytes", () => {
      assert.strictEqual(safeCompare("pass\0word", "pass\0word"), true);
      assert.strictEqual(safeCompare("pass\0word", "password"), false);
    });

    it("should handle strings with newlines", () => {
      assert.strictEqual(safeCompare("pass\nword", "pass\nword"), true);
      assert.strictEqual(safeCompare("pass\nword", "pass\rword"), false);
    });

    it("should handle whitespace-only strings", () => {
      assert.strictEqual(safeCompare("   ", "   "), true);
      assert.strictEqual(safeCompare("   ", "    "), false);
    });
  });
});
