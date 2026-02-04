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
    client_id: generateClientId(),
    client_secret: "test-secret",
    client_name: "Test Client",
    redirect_uris: ["http://localhost:3000/callback"],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
    created_at: Date.now(),
    is_dynamic: false,
    ...overrides,
  };
}

// Create a dynamic (DCR-registered) client.
export function createDynamicClient(
  overrides: Partial<StoredClient> = {},
): StoredClient {
  return createTestClient({
    is_dynamic: true,
    token_endpoint_auth_method: "none",
    ...overrides,
  });
}

// Create a M2M client for client_credentials flow.
export function createM2MClient(
  overrides: Partial<StoredClient> = {},
): StoredClient {
  return createTestClient({
    grant_types: ["client_credentials"],
    response_types: [],
    redirect_uris: undefined,
    ...overrides,
  });
}

// Create a test access token with sensible defaults.
export function createTestAccessToken(
  overrides: Partial<StoredAccessToken> = {},
): StoredAccessToken {
  return {
    token: generateToken(),
    client_id: "test-client",
    scope: "read write",
    expires_at: Date.now() + TOKEN_EXPIRY.ACCESS_TOKEN,
    user_id: "testuser",
    ...overrides,
  };
}

// Create an expired access token.
export function createExpiredAccessToken(
  overrides: Partial<StoredAccessToken> = {},
): StoredAccessToken {
  return createTestAccessToken({
    expires_at: Date.now() - 1000,
    ...overrides,
  });
}

// Create a test refresh token with sensible defaults.
export function createTestRefreshToken(
  overrides: Partial<StoredRefreshToken> = {},
): StoredRefreshToken {
  return {
    token: generateToken(),
    client_id: "test-client",
    scope: "read write",
    expires_at: Date.now() + TOKEN_EXPIRY.REFRESH_TOKEN,
    user_id: "testuser",
    ...overrides,
  };
}

// Create an expired refresh token.
export function createExpiredRefreshToken(
  overrides: Partial<StoredRefreshToken> = {},
): StoredRefreshToken {
  return createTestRefreshToken({
    expires_at: Date.now() - 1000,
    ...overrides,
  });
}
