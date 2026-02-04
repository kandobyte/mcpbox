// Cryptographic utilities for OAuth testing.

import { createHash, randomBytes } from "node:crypto";

// Generate a PKCE code verifier (random base64url string).
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

// Generate a PKCE code challenge from a verifier (S256 method).
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// Generate a random token for testing.
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// Generate a random client ID for testing.
export function generateClientId(): string {
  return `test-client-${randomBytes(8).toString("hex")}`;
}
