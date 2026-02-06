import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { StoredClient } from "../storage/types.js";
import { safeCompare } from "./crypto.js";

/**
 * Hash a secret using SHA-256.
 * Used for storing tokens and client secrets.
 * @package
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Verify a client secret against a stored hash using timing-safe comparison.
 * @package
 */
export function verifyClientSecret(input: string, storedHash: string): boolean {
  return safeCompare(hashSecret(input), storedHash);
}

/**
 * Check if a password string is a bcrypt hash.
 * @package
 */
export function isBcryptHash(password: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(password);
}

/**
 * Verify a password against a stored value.
 * Supports both plain text (timing-safe) and bcrypt hashed passwords.
 * @package
 */
export function verifyPassword(input: string, stored: string): boolean {
  if (isBcryptHash(stored)) {
    return bcrypt.compareSync(input, stored);
  }
  return safeCompare(stored, input);
}

/**
 * Check if a redirect URI is allowed for a client.
 * Uses exact string matching as required by OAuth 2.0 spec.
 * @package
 */
export function isRedirectUriAllowed(
  redirectUri: string,
  client: StoredClient,
): boolean {
  return client.redirectUris?.includes(redirectUri) ?? false;
}

/**
 * Parse a Bearer token from an Authorization header.
 * Returns null if the header is missing or malformed.
 * @package
 */
export function parseBearerToken(
  authHeader: string | undefined,
): string | null {
  if (!authHeader) {
    return null;
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
