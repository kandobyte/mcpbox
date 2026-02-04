import assert from "node:assert";
import { describe, it, mock } from "node:test";

/**
 * Tests for tools allowlist filtering logic.
 * These tests verify the filtering behavior without starting actual MCP servers.
 */
describe("McpManager Tool Filtering", () => {
  describe("filterToolsByAllowlist", () => {
    // Extract the filtering logic for unit testing
    function filterTools(
      rawTools: { name: string }[],
      toolsAllowlist: string[] | undefined,
    ): { name: string }[] {
      return toolsAllowlist
        ? rawTools.filter((tool) => toolsAllowlist.includes(tool.name))
        : rawTools;
    }

    function findUnknownTools(
      toolsAllowlist: string[],
      availableToolNames: string[],
    ): string[] {
      return toolsAllowlist.filter(
        (name) => !availableToolNames.includes(name),
      );
    }

    it("should return all tools when no allowlist is configured", () => {
      const rawTools = [
        { name: "tool_a" },
        { name: "tool_b" },
        { name: "tool_c" },
      ];

      const result = filterTools(rawTools, undefined);

      assert.deepStrictEqual(result, rawTools);
    });

    it("should filter tools to only those in the allowlist", () => {
      const rawTools = [
        { name: "list_issues" },
        { name: "create_issue" },
        { name: "delete_issue" },
        { name: "get_pull_request" },
      ];
      const allowlist = ["list_issues", "create_issue"];

      const result = filterTools(rawTools, allowlist);

      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(
        result.map((t) => t.name),
        ["list_issues", "create_issue"],
      );
    });

    it("should return empty array when allowlist has no matching tools", () => {
      const rawTools = [
        { name: "tool_a" },
        { name: "tool_b" },
        { name: "tool_c" },
      ];
      const allowlist = ["nonexistent_tool"];

      const result = filterTools(rawTools, allowlist);

      assert.deepStrictEqual(result, []);
    });

    it("should handle empty allowlist", () => {
      const rawTools = [{ name: "tool_a" }, { name: "tool_b" }];
      const allowlist: string[] = [];

      const result = filterTools(rawTools, allowlist);

      assert.deepStrictEqual(result, []);
    });

    it("should handle empty raw tools list", () => {
      const rawTools: { name: string }[] = [];
      const allowlist = ["tool_a", "tool_b"];

      const result = filterTools(rawTools, allowlist);

      assert.deepStrictEqual(result, []);
    });

    it("should identify unknown tools in allowlist", () => {
      const allowlist = ["list_issues", "typo_tool", "another_typo"];
      const availableTools = ["list_issues", "create_issue", "delete_issue"];

      const unknown = findUnknownTools(allowlist, availableTools);

      assert.deepStrictEqual(unknown, ["typo_tool", "another_typo"]);
    });

    it("should return empty array when all allowlist tools exist", () => {
      const allowlist = ["list_issues", "create_issue"];
      const availableTools = ["list_issues", "create_issue", "delete_issue"];

      const unknown = findUnknownTools(allowlist, availableTools);

      assert.deepStrictEqual(unknown, []);
    });

    it("should preserve tool order from raw tools", () => {
      const rawTools = [
        { name: "z_tool" },
        { name: "a_tool" },
        { name: "m_tool" },
      ];
      const allowlist = ["m_tool", "z_tool"];

      const result = filterTools(rawTools, allowlist);

      // Order should match rawTools, not allowlist
      assert.deepStrictEqual(
        result.map((t) => t.name),
        ["z_tool", "m_tool"],
      );
    });
  });
});
