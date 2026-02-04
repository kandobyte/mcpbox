/**
 * MCP namespace utilities for prefixing and stripping server names
 * from tool names, resource URIs, and prompt names.
 *
 * Format: `serverName__originalName`
 */

const SEPARATOR = "__";

/**
 * Add namespace prefix to a name.
 * @example namespaceName("github", "create_issue") => "github__create_issue"
 */
export function namespaceName(serverName: string, name: string): string {
  return `${serverName}${SEPARATOR}${name}`;
}

/**
 * Extract server name from a namespaced name.
 * Returns null if the name doesn't contain the separator.
 * @example extractServerName("github__create_issue") => "github"
 * @example extractServerName("create_issue") => null
 */
export function extractServerName(namespacedName: string): string | null {
  const idx = namespacedName.indexOf(SEPARATOR);
  return idx > 0 ? namespacedName.substring(0, idx) : null;
}

/**
 * Strip namespace prefix to get the original name.
 * @example stripNamespace("github", "github__create_issue") => "create_issue"
 */
export function stripNamespace(
  serverName: string,
  namespacedName: string,
): string {
  return namespacedName.substring(serverName.length + SEPARATOR.length);
}

/**
 * Check if a name is namespaced (contains the separator).
 * @example isNamespaced("github__create_issue") => true
 * @example isNamespaced("create_issue") => false
 */
export function isNamespaced(name: string): boolean {
  return name.includes(SEPARATOR);
}
