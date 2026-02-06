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
        client_id: "gh-id",
        client_secret: "gh-secret",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept github provider with allowed_orgs and allowed_users", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "github",
        client_id: "gh-id",
        client_secret: "gh-secret",
        allowed_orgs: ["myorg"],
        allowed_users: ["admin"],
      });
      assert.strictEqual(result.success, true);
    });

    it("should reject github provider without client_id", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "github",
        client_secret: "gh-secret",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject github provider without client_secret", () => {
      const result = IdentityProviderSchema.safeParse({
        type: "github",
        client_id: "gh-id",
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
    it("should accept authorization_code client with redirect_uris", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "web-app",
        redirect_uris: ["https://app.example.com/callback"],
        grant_type: "authorization_code",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept client_credentials client with secret", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "backend-service",
        client_secret: "secret123",
        grant_type: "client_credentials",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept client with optional client_name", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "my-app",
        client_name: "My Application",
        client_secret: "secret",
        grant_type: "client_credentials",
      });
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.client_name, "My Application");
      }
    });

    it("should reject authorization_code without redirect_uris", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "web-app",
        grant_type: "authorization_code",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject authorization_code with empty redirect_uris", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "web-app",
        redirect_uris: [],
        grant_type: "authorization_code",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject client_credentials without client_secret", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "backend-service",
        grant_type: "client_credentials",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject invalid redirect_uri format", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "web-app",
        redirect_uris: ["not-a-url"],
        grant_type: "authorization_code",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject invalid grant_type", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "app",
        grant_type: "implicit",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject empty client_id", () => {
      const result = OAuthClientSchema.safeParse({
        client_id: "",
        client_secret: "secret",
        grant_type: "client_credentials",
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
      it("should accept oauth with identity_providers", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          identity_providers: [
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
              client_id: "app",
              client_secret: "secret",
              grant_type: "client_credentials",
            },
          ],
        });
        assert.strictEqual(result.success, true);
      });

      it("should accept oauth with dynamic_registration and identity_providers", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          identity_providers: [
            {
              type: "local",
              users: [{ username: "admin", password: "pass" }],
            },
          ],
          dynamic_registration: true,
        });
        assert.strictEqual(result.success, true);
      });

      it("should reject oauth with dynamic_registration but no identity_providers", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          dynamic_registration: true,
        });
        assert.strictEqual(result.success, false);
      });

      it("should accept oauth with issuer", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          issuer: "https://auth.example.com",
          identity_providers: [
            {
              type: "local",
              users: [{ username: "admin", password: "pass" }],
            },
          ],
        });
        assert.strictEqual(result.success, true);
      });

      it("should reject oauth without identity_providers, clients, or dynamic_registration", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
        });
        assert.strictEqual(result.success, false);
      });

      it("should reject oauth with dynamic_registration=false and nothing else", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          dynamic_registration: false,
        });
        assert.strictEqual(result.success, false);
      });

      it("should reject invalid issuer URL", () => {
        const result = AuthConfigSchema.safeParse({
          type: "oauth",
          issuer: "not-a-url",
          identity_providers: [
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
