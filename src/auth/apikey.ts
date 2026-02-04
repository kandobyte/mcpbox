import { safeCompare } from "./crypto.js";

/**
 * Check if provided API key matches expected key (timing-safe).
 */
export function checkApiKey(
  provided: string | undefined,
  expected: string,
): boolean {
  if (!provided) return false;
  return safeCompare(provided, expected);
}
