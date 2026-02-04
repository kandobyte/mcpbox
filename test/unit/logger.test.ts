import assert from "node:assert";
import { describe, it } from "node:test";
import { redactSensitiveStrings } from "../../src/logger.js";

describe("redactSensitiveStrings", () => {
  describe("String Redaction", () => {
    it("should redact PASSWORD= patterns", () => {
      const input = "PASSWORD=mysecretpass123";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "PASSWORD=***");
    });

    it("should redact TOKEN= patterns", () => {
      const input = "TOKEN=abc123xyz";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "TOKEN=***");
    });

    it("should redact SECRET= patterns", () => {
      const input = "SECRET=verysecret";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "SECRET=***");
    });

    it("should redact KEY= patterns", () => {
      const input = "API_KEY=sk_live_abc123";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "API_KEY=***");
    });

    it("should redact PIN= patterns", () => {
      const input = "PIN=1234";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "PIN=***");
    });

    it("should be case-insensitive", () => {
      assert.strictEqual(
        redactSensitiveStrings("password=secret"),
        "password=***",
      );
      assert.strictEqual(
        redactSensitiveStrings("Password=secret"),
        "Password=***",
      );
      assert.strictEqual(redactSensitiveStrings("token=abc"), "token=***");
    });

    it("should handle multiple patterns in same string", () => {
      const input = "PASSWORD=pass1 TOKEN=tok2 KEY=key3";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "PASSWORD=*** TOKEN=*** KEY=***");
    });

    it("should preserve non-sensitive content", () => {
      const input = "Connecting to database on port 5432";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "Connecting to database on port 5432");
    });

    it("should handle mixed sensitive and non-sensitive content", () => {
      const input = "User logged in with TOKEN=abc123 at 10:00";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "User logged in with TOKEN=*** at 10:00");
    });
  });

  describe("Object Redaction", () => {
    it("should redact strings within objects", () => {
      const input = { cmd: "login PASSWORD=secret123" };
      const result = redactSensitiveStrings(input);
      assert.deepStrictEqual(result, { cmd: "login PASSWORD=***" });
    });

    it("should redact nested object strings", () => {
      const input = {
        outer: {
          inner: "TOKEN=mysecret",
        },
      };
      const result = redactSensitiveStrings(input);
      assert.deepStrictEqual(result, {
        outer: {
          inner: "TOKEN=***",
        },
      });
    });

    it("should preserve non-string values", () => {
      const input = {
        count: 42,
        enabled: true,
        data: null,
      };
      const result = redactSensitiveStrings(input);
      assert.deepStrictEqual(result, {
        count: 42,
        enabled: true,
        data: null,
      });
    });
  });

  describe("Array Redaction", () => {
    it("should redact strings within arrays", () => {
      const input = ["PASSWORD=secret1", "normal", "TOKEN=secret2"];
      const result = redactSensitiveStrings(input);
      assert.deepStrictEqual(result, ["PASSWORD=***", "normal", "TOKEN=***"]);
    });

    it("should redact nested arrays", () => {
      const input = [["KEY=nested"]];
      const result = redactSensitiveStrings(input);
      assert.deepStrictEqual(result, [["KEY=***"]]);
    });

    it("should handle mixed arrays", () => {
      const input = [42, "SECRET=abc", { msg: "PIN=1234" }];
      const result = redactSensitiveStrings(input);
      assert.deepStrictEqual(result, [42, "SECRET=***", { msg: "PIN=***" }]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string", () => {
      assert.strictEqual(redactSensitiveStrings(""), "");
    });

    it("should handle empty object", () => {
      assert.deepStrictEqual(redactSensitiveStrings({}), {});
    });

    it("should handle empty array", () => {
      assert.deepStrictEqual(redactSensitiveStrings([]), []);
    });

    it("should handle null", () => {
      assert.strictEqual(redactSensitiveStrings(null), null);
    });

    it("should handle undefined", () => {
      assert.strictEqual(redactSensitiveStrings(undefined), undefined);
    });

    it("should handle numbers", () => {
      assert.strictEqual(redactSensitiveStrings(42), 42);
    });

    it("should handle booleans", () => {
      assert.strictEqual(redactSensitiveStrings(true), true);
      assert.strictEqual(redactSensitiveStrings(false), false);
    });

    it("should not redact partial matches", () => {
      // "KEY" alone without "=" should not be redacted
      const input = "The KEY is important";
      const result = redactSensitiveStrings(input);
      assert.strictEqual(result, "The KEY is important");
    });

    it("should handle value with special characters", () => {
      const input = "TOKEN=abc!@#$%^&*()";
      const result = redactSensitiveStrings(input);
      // \S* matches until whitespace, so special chars are included
      assert.strictEqual(result, "TOKEN=***");
    });
  });
});
