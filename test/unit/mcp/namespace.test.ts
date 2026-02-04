import assert from "node:assert";
import { describe, it } from "node:test";
import {
  extractServerName,
  isNamespaced,
  namespaceName,
  stripNamespace,
} from "../../../src/mcp/namespace.js";

describe("mcp/namespace", () => {
  describe("namespaceName", () => {
    it("should prefix name with server and separator", () => {
      assert.strictEqual(
        namespaceName("github", "create_issue"),
        "github__create_issue",
      );
    });

    it("should handle server names with hyphens", () => {
      assert.strictEqual(namespaceName("my-server", "tool"), "my-server__tool");
    });

    it("should handle tool names with underscores", () => {
      assert.strictEqual(
        namespaceName("server", "my_tool_name"),
        "server__my_tool_name",
      );
    });

    it("should handle empty tool name", () => {
      assert.strictEqual(namespaceName("server", ""), "server__");
    });

    it("should handle resource URIs", () => {
      assert.strictEqual(
        namespaceName("filesystem", "file:///path/to/file"),
        "filesystem__file:///path/to/file",
      );
    });
  });

  describe("extractServerName", () => {
    it("should extract server name from namespaced name", () => {
      assert.strictEqual(extractServerName("github__create_issue"), "github");
    });

    it("should return null for non-namespaced name", () => {
      assert.strictEqual(extractServerName("create_issue"), null);
    });

    it("should handle server name with hyphens", () => {
      assert.strictEqual(extractServerName("my-server__tool"), "my-server");
    });

    it("should return first part when multiple separators exist", () => {
      // "a__b__c" -> server is "a", original name is "b__c"
      assert.strictEqual(extractServerName("a__b__c"), "a");
    });

    it("should return null for name starting with separator", () => {
      // "__tool" has empty server name, indexOf returns 0, condition is > 0
      assert.strictEqual(extractServerName("__tool"), null);
    });

    it("should return null for empty string", () => {
      assert.strictEqual(extractServerName(""), null);
    });
  });

  describe("stripNamespace", () => {
    it("should remove server prefix and separator", () => {
      assert.strictEqual(
        stripNamespace("github", "github__create_issue"),
        "create_issue",
      );
    });

    it("should handle names containing separator", () => {
      // Original name was "tool__v2", namespaced as "server__tool__v2"
      assert.strictEqual(
        stripNamespace("server", "server__tool__v2"),
        "tool__v2",
      );
    });

    it("should handle empty original name", () => {
      assert.strictEqual(stripNamespace("server", "server__"), "");
    });

    it("should handle resource URIs", () => {
      assert.strictEqual(
        stripNamespace("fs", "fs__file:///path/to/file"),
        "file:///path/to/file",
      );
    });
  });

  describe("isNamespaced", () => {
    it("should return true for namespaced name", () => {
      assert.strictEqual(isNamespaced("github__create_issue"), true);
    });

    it("should return false for non-namespaced name", () => {
      assert.strictEqual(isNamespaced("create_issue"), false);
    });

    it("should return true for name with multiple separators", () => {
      assert.strictEqual(isNamespaced("a__b__c"), true);
    });

    it("should return true for separator only", () => {
      assert.strictEqual(isNamespaced("__"), true);
    });

    it("should return false for empty string", () => {
      assert.strictEqual(isNamespaced(""), false);
    });

    it("should return false for single underscore", () => {
      assert.strictEqual(isNamespaced("tool_name"), false);
    });
  });

  describe("round-trip", () => {
    it("should restore original name after namespace and strip", () => {
      const server = "github";
      const original = "create_issue";
      const namespaced = namespaceName(server, original);
      const restored = stripNamespace(server, namespaced);
      assert.strictEqual(restored, original);
    });

    it("should restore original with underscores", () => {
      const server = "my-server";
      const original = "my_complex_tool_name";
      const namespaced = namespaceName(server, original);
      const restored = stripNamespace(server, namespaced);
      assert.strictEqual(restored, original);
    });

    it("should restore original containing separator", () => {
      const server = "srv";
      const original = "tool__with__separators";
      const namespaced = namespaceName(server, original);
      const restored = stripNamespace(server, namespaced);
      assert.strictEqual(restored, original);
    });

    it("should restore URI", () => {
      const server = "filesystem";
      const original = "file:///home/user/doc.txt";
      const namespaced = namespaceName(server, original);
      const restored = stripNamespace(server, namespaced);
      assert.strictEqual(restored, original);
    });
  });
});
