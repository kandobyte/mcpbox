/**
 * Shared test constants to avoid magic numbers and hardcoded values.
 */

// Server ports for different test suites (avoid conflicts)
export const PORTS = {
  MCP: 8078,
  OAUTH: 8079,
  STORAGE: 8080,
  LOGGER: 8081,
} as const;

// Standard delays for async operations
export const DELAYS = {
  SERVER_STARTUP: 100,
  SERVER_SHUTDOWN: 50,
} as const;

// Test credentials (never use in production)
export const TEST_CREDENTIALS = {
  USER: {
    username: "testuser",
    password: "testpass",
  },
  ADMIN: {
    username: "admin",
    password: "adminpass",
  },
} as const;

// Test OAuth clients
export const TEST_CLIENTS = {
  // Authorization Code client (user-facing)
  AUTH_CODE: {
    client_id: "test-client",
    client_secret: "test-secret",
    redirect_uris: ["http://localhost:3000/callback"],
    grant_type: "authorization_code" as const,
  },
  // Public Authorization Code client (no secret, PKCE required)
  PUBLIC: {
    client_id: "public-client",
    redirect_uris: ["http://localhost:3000/callback"],
    grant_type: "authorization_code" as const,
  },
  // Machine-to-machine client (Client Credentials)
  M2M: {
    client_id: "m2m-client",
    client_secret: "m2m-secret",
    grant_type: "client_credentials" as const,
  },
} as const;

// API key for testing (must be 16-128 chars, alphanumeric with - and _)
export const TEST_API_KEY = "test-api-key-1234567";

// Token expiration times (in milliseconds)
export const TOKEN_EXPIRY = {
  ACCESS_TOKEN: 3600 * 1000,
  REFRESH_TOKEN: 90 * 24 * 3600 * 1000,
  AUTH_CODE: 10 * 60 * 1000,
} as const;
