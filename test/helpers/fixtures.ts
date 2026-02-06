// Test data factories for creating test objects.

import type {
  StoredAccessToken,
  StoredClient,
  StoredRefreshToken,
} from "../../src/storage/types.js";
import { TOKEN_EXPIRY } from "./constants.js";
import { generateClientId, generateToken } from "./crypto.js";

// Create a test client with sensible defaults.
export function createTestClient(
  overrides: Partial<StoredClient> = {},
): StoredClient {
  return {
    clientId: generateClientId(),
    clientSecret: "test-secret",
    clientName: "Test Client",
    redirectUris: ["http://localhost:3000/callback"],
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "client_secret_post",
    createdAt: Date.now(),
    isDynamic: false,
    ...overrides,
  };
}

// Create a dynamic (DCR-registered) client.
export function createDynamicClient(
  overrides: Partial<StoredClient> = {},
): StoredClient {
  return createTestClient({
    isDynamic: true,
    tokenEndpointAuthMethod: "none",
    ...overrides,
  });
}

// Create a M2M client for client_credentials flow.
export function createM2MClient(
  overrides: Partial<StoredClient> = {},
): StoredClient {
  return createTestClient({
    grantTypes: ["client_credentials"],
    responseTypes: [],
    redirectUris: undefined,
    ...overrides,
  });
}

// Create a test access token with sensible defaults.
export function createTestAccessToken(
  overrides: Partial<StoredAccessToken> = {},
): StoredAccessToken {
  return {
    token: generateToken(),
    clientId: "test-client",
    scope: "read write",
    expiresAt: Date.now() + TOKEN_EXPIRY.ACCESS_TOKEN,
    userId: "testuser",
    ...overrides,
  };
}

// Create an expired access token.
export function createExpiredAccessToken(
  overrides: Partial<StoredAccessToken> = {},
): StoredAccessToken {
  return createTestAccessToken({
    expiresAt: Date.now() - 1000,
    ...overrides,
  });
}

// Create a test refresh token with sensible defaults.
export function createTestRefreshToken(
  overrides: Partial<StoredRefreshToken> = {},
): StoredRefreshToken {
  return {
    token: generateToken(),
    clientId: "test-client",
    scope: "read write",
    expiresAt: Date.now() + TOKEN_EXPIRY.REFRESH_TOKEN,
    userId: "testuser",
    ...overrides,
  };
}

// Create an expired refresh token.
export function createExpiredRefreshToken(
  overrides: Partial<StoredRefreshToken> = {},
): StoredRefreshToken {
  return createTestRefreshToken({
    expiresAt: Date.now() - 1000,
    ...overrides,
  });
}
