import assert from "node:assert";
import { describe, it } from "node:test";
import {
  AuthConfigSchema,
  IdentityProviderSchema,
  LogConfigSchema,
  McpServerEntrySchema,
  OAuthClientSchema,
  OAuthUserSchema,
  ServerConfigSchema,
  StorageConfigSchema,
} from "../../../src/config/schema.js";

describe("Config Schemas", () => {
  describe("McpServerEntrySchema", () => {
    it("should accept valid entry with command only", () => {
      const result = McpServerEntrySchema.safeParse({
        command: "/usr/bin/mcp-server",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept entry with command and args", () => {
      const result = McpServerEntrySchema.safeParse({
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept entry with env vars", () => {
      const result = McpServerEntrySchema.safeParse({
        command: "node",
        args: ["server.js"],
        env: { API_KEY: "secret", DEBUG: "true" },
      });
      assert.strictEqual(result.success, true);
    });

    it("should reject empty command", () => {
      const result = McpServerEntrySchema.safeParse({
        command: "",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject missing command", () => {
      const result = McpServerEntrySchema.safeParse({
        args: ["--help"],
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject unknown fields", () => {
      const result = McpServerEntrySchema.safeParse({
        command: "node",
        unknownField: "value",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("OAuthUserSchema", () => {
    it("should accept valid user", () => {
      const result = OAuthUserSchema.safeParse({
        username: "admin",
        password: "secret123",
      });
      assert.strictEqual(result.success, true);
    });

    it("should reject empty username", () => {
      const result = OAuthUserSchema.safeParse({
        username: "",
        password: "secret123",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject empty password", () => {
      const result = OAuthUserSchema.safeParse({
        username: "admin",
        password: "",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject missing fields", () => {
      const result = OAuthUserSchema.safeParse({
        username: "admin",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("IdentityProviderSchema", () => {
    it("should accept local provider with users", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "local",
        users: [{ username: "admin", password: "pass" }],
      });
      assert.strictEqual(result.success, true);
    });

    it("should reject local provider without users", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "local",
        users: [],
      });
      assert.strictEqual(result.success, false);
    });

    it("should accept github provider", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "github",
        clientId: "gh-id",
        clientSecret: "gh-secret",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept github provider with allowedOrgs and allowedUsers", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "github",
        clientId: "gh-id",
        clientSecret: "gh-secret",
        allowedOrgs: ["myorg"],
        allowedUsers: ["admin"],
      });
      assert.strictEqual(result.success, true);
    });

    it("should reject github provider without clientId", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "github",
        clientSecret: "gh-secret",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject github provider without clientSecret", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "github",
        clientId: "gh-id",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject unknown provider type", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "google",
        client_id: "id",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("OAuthClientSchema", () => {
    it("should accept authorization_code client with redirectUris", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "web-app",
        redirectUris: ["https://app.example.com/callback"],
        grantType: "authorization_code",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept client_credentials client with secret", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "backend-service",
        clientSecret: "secret123",
        grantType: "client_credentials",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept client with optional clientName", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "my-app",
        clientName: "My Application",
        clientSecret: "secret",
        grantType: "client_credentials",
      });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.clientName, "My Application");
      }
    });

    it("should reject authorization_code without redirectUris", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "web-app",
        grantType: "authorization_code",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject authorization_code with empty redirectUris", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "web-app",
        redirectUris: [],
        grantType: "authorization_code",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject client_credentials without clientSecret", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "backend-service",
        grantType: "client_credentials",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject invalid redirect URI format", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "web-app",
        redirectUris: ["not-a-url"],
        grantType: "authorization_code",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject invalid grantType", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "app",
        grantType: "implicit",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject empty clientId", () => {
      const result = OAuthClientSchema.safeParse({
        clientId: "",
        clientSecret: "secret",
        grantType: "client_credentials",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("AuthConfigSchema", () => {
    describe("apikey type", () => {
      it("should accept valid API key", () => {
        const result = AuthConfigSchema.safeParse({
          type: "apikey",
          apiKey: "sk_live_abc123XYZ789",
        });
        assert.strictEqual(result.success, true);
      });

      it("should reject API key shorter than 16 chars", () => {
        const result = AuthConfigSchema.safeParse({
          type: "apikey",
          apiKey: "short",
        });
        assert.strictEqual(result.success, false);
      });

      it("should reject API key with invalid characters", () => {
        const result = AuthConfigSchema.safeParse({
          type: "apikey",
          apiKey: "key!@#$%^&*()12345678",
        });
        assert.strictEqual(result.success, false);
      });

      it("should accept API key with hyphens and underscores", () => {
        const result = AuthConfigSchema.safeParse({
          type: "apikey",
          apiKey: "sk_live_abc-123_XYZ",
        });
        assert.strictEqual(result.success, true);
      });
    });

    describe("oauth type", () => {
      it("should accept oauth with identityProviders", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: "pass123" }],
            },
          ],
        });
        assert.strictEqual(result.success, true);
      });

      it("should accept oauth with clients", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          clients: [
            {
              clientId: "app",
              clientSecret: "secret",
              grantType: "client_credentials",
            },
          ],
        });
        assert.strictEqual(result.success, true);
      });

      it("should accept oauth with dynamicRegistration and identityProviders", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: "pass" }],
            },
          ],
          dynamicRegistration: true,
        });
        assert.strictEqual(result.success, true);
      });

      it("should reject oauth with dynamicRegistration but no identityProviders", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          dynamicRegistration: true,
        });
        assert.strictEqual(result.success, false);
      });

      it("should accept oauth with issuer", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          issuer: "https://auth.example.com",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: "pass" }],
            },
          ],
        });
        assert.strictEqual(result.success, true);
      });

      it("should reject oauth without identityProviders, clients, or dynamicRegistration", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
        });
        assert.strictEqual(result.success, false);
      });

      it("should reject oauth with dynamicRegistration=false and nothing else", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          dynamicRegistration: false,
        });
        assert.strictEqual(result.success, false);
      });

      it("should reject invalid issuer URL", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          issuer: "not-a-url",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: "pass" }],
            },
          ],
        });
        assert.strictEqual(result.success, false);
      });
    });

    it("should reject unknown auth type", () => {
      const result = AuthConfigSchema.safeParse({
        type: "basic",
        username: "admin",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("ServerConfigSchema", () => {
    it("should apply default port", () => {
      const result = ServerConfigSchema.safeParse({});
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.port, 8080);
      }
    });

    it("should accept custom port", () => {
      const result = ServerConfigSchema.safeParse({ port: 3000 });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.port, 3000);
      }
    });

    it("should reject port below 1", () => {
      const result = ServerConfigSchema.safeParse({ port: 0 });
      assert.strictEqual(result.success, false);
    });

    it("should reject port above 65535", () => {
      const result = ServerConfigSchema.safeParse({ port: 70000 });
      assert.strictEqual(result.success, false);
    });

    it("should reject non-integer port", () => {
      const result = ServerConfigSchema.safeParse({ port: 3000.5 });
      assert.strictEqual(result.success, false);
    });

    it("should reject unknown fields", () => {
      const result = ServerConfigSchema.safeParse({
        port: 8080,
        host: "localhost",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("LogConfigSchema", () => {
    it("should accept valid log levels", () => {
      for (const level of ["debug", "info", "warn", "error"]) {
        const result = LogConfigSchema.safeParse({ level });
        assert.strictEqual(result.success, true, `Failed for level: ${level}`);
      }
    });

    it("should reject invalid log level", () => {
      const result = LogConfigSchema.safeParse({ level: "verbose" });
      assert.strictEqual(result.success, false);
    });

    it("should accept valid formats", () => {
      for (const format of ["pretty", "json"]) {
        const result = LogConfigSchema.safeParse({ format });
        assert.strictEqual(
          result.success,
          true,
          `Failed for format: ${format}`,
        );
      }
    });

    it("should reject invalid format", () => {
      const result = LogConfigSchema.safeParse({ format: "text" });
      assert.strictEqual(result.success, false);
    });

    it("should accept boolean redactSecrets", () => {
      const result = LogConfigSchema.safeParse({ redactSecrets: false });
      assert.strictEqual(result.success, true);
    });

    it("should accept boolean mcpDebug", () => {
      const result = LogConfigSchema.safeParse({ mcpDebug: true });
      assert.strictEqual(result.success, true);
    });

    it("should accept empty config", () => {
      const result = LogConfigSchema.safeParse({});
      assert.strictEqual(result.success, true);
    });
  });

  describe("StorageConfigSchema", () => {
    it("should accept memory storage", () => {
      const result = StorageConfigSchema.safeParse({ type: "memory" });
      assert.strictEqual(result.success, true);
    });

    it("should accept sqlite storage with path", () => {
      const result = StorageConfigSchema.safeParse({
        type: "sqlite",
        path: "./data/app.db",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept sqlite storage without path", () => {
      const result = StorageConfigSchema.safeParse({ type: "sqlite" });
      assert.strictEqual(result.success, true);
    });

    it("should reject unknown storage type", () => {
      const result = StorageConfigSchema.safeParse({ type: "redis" });
      assert.strictEqual(result.success, false);
    });

    it("should reject memory storage with path", () => {
      const result = StorageConfigSchema.safeParse({
        type: "memory",
        path: "./data.db",
      });
      assert.strictEqual(result.success, false);
    });
  });
});
