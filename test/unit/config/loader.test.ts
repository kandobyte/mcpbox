import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";

const TEST_DIR = join(import.meta.dirname, ".tmp");

function writeConfig(filename: string, content: object | string): string {
  const path = join(TEST_DIR, filename);
  const data =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
  writeFileSync(path, data);
  return path;
}

describe("Config Loader", () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    try {
      rmSync(TEST_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Basic Parsing", () => {
    it("should parse basic JSON config", async () => {
      const path = writeConfig("basic.json", {
        server: { port: 9000 },
        mcpServers: {
          "test-mcp": {
            command: "echo",
            args: ["hello"],
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.server.port, 9000);
      assert.strictEqual(config.auth, undefined);
      assert.strictEqual(config.mcps.length, 1);
      assert.strictEqual(config.mcps[0].name, "test-mcp");
      assert.strictEqual(config.mcps[0].command, "echo");
      assert.deepStrictEqual(config.mcps[0].args, ["hello"]);
    });

    it("should handle config without mcpServers", async () => {
      const path = writeConfig("no-mcps.json", {
        server: { port: 8080 },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.deepStrictEqual(config.mcps, []);
    });
  });

  describe("Environment Variable Substitution", () => {
    it("should substitute environment variables in strings", async () => {
      process.env.TEST_USER = "testuser";
      process.env.TEST_PASS = "testpass";

      const path = writeConfig("env.json", {
        auth: {
          type: "oauth",
          identityProviders: [
            {
              type: "local",
              // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var substitution
              users: [{ username: "${TEST_USER}", password: "${TEST_PASS}" }],
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.auth?.type, "oauth");
      if (config.auth?.type === "oauth") {
        const provider = config.auth.identityProviders?.[0];
        assert.strictEqual(provider?.type, "local");
        if (provider?.type === "local") {
          assert.strictEqual(provider.users[0].username, "testuser");
          assert.strictEqual(provider.users[0].password, "testpass");
        }
      }

      delete process.env.TEST_USER;
      delete process.env.TEST_PASS;
    });

    it("should substitute env vars in mcpServers", async () => {
      process.env.MCP_TOKEN = "secret-token";

      const path = writeConfig("mcp-env.json", {
        mcpServers: {
          "api-mcp": {
            command: "node",
            args: ["server.js"],
            env: {
              // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var substitution
              API_TOKEN: "${MCP_TOKEN}",
              DEBUG: "true",
            },
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.mcps[0].name, "api-mcp");
      assert.strictEqual(config.mcps[0].env?.API_TOKEN, "secret-token");
      assert.strictEqual(config.mcps[0].env?.DEBUG, "true");

      delete process.env.MCP_TOKEN;
    });

    it("should throw on missing environment variable", async () => {
      delete process.env.NONEXISTENT_VAR;

      const path = writeConfig("missing-env.json", {
        auth: {
          type: "apikey",
          // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var substitution
          apiKey: "${NONEXISTENT_VAR}",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(
        () => loadConfig(path),
        /Environment variable NONEXISTENT_VAR is not set/,
      );
    });

    it("should handle multiple env vars in same string", async () => {
      process.env.HOST = "localhost";
      process.env.PORT = "5432";

      const path = writeConfig("multi-env.json", {
        mcpServers: {
          db: {
            command: "psql",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: testing env var substitution
            args: ["${HOST}:${PORT}"],
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.deepStrictEqual(config.mcps[0].args, ["localhost:5432"]);

      delete process.env.HOST;
      delete process.env.PORT;
    });
  });

  describe("Client Configs", () => {
    it("should parse client with redirectUris", async () => {
      const path = writeConfig("client.json", {
        auth: {
          type: "oauth",
          clients: [
            {
              clientId: "my-app",
              clientSecret: "app-secret",
              redirectUris: [
                "https://myapp.com/callback",
                "https://myapp.com/oauth",
              ],
              grantType: "authorization_code",
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.auth?.type, "oauth");
      if (config.auth?.type === "oauth") {
        const clients = config.auth.clients;
        assert.ok(clients);
        assert.strictEqual(clients[0].clientId, "my-app");
        assert.strictEqual(clients[0].clientSecret, "app-secret");
        assert.deepStrictEqual(clients[0].redirectUris, [
          "https://myapp.com/callback",
          "https://myapp.com/oauth",
        ]);
      }
    });

    it("should parse M2M client without redirectUris", async () => {
      const path = writeConfig("m2m-client.json", {
        auth: {
          type: "oauth",
          clients: [
            {
              clientId: "m2m-app",
              clientSecret: "m2m-secret",
              grantType: "client_credentials",
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.auth?.type, "oauth");
      if (config.auth?.type === "oauth") {
        const clients = config.auth.clients;
        assert.ok(clients);
        assert.strictEqual(clients[0].clientId, "m2m-app");
        assert.strictEqual(clients[0].grantType, "client_credentials");
      }
    });
  });

  describe("Defaults", () => {
    it("should apply default port when server not specified", async () => {
      const path = writeConfig("defaults.json", {});

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.server.port, 8080);
      assert.strictEqual(config.auth, undefined);
      assert.deepStrictEqual(config.mcps, []);
    });

    it("should apply default port for empty server config", async () => {
      const path = writeConfig("partial-server.json", {
        server: {},
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.server.port, 8080);
    });
  });

  describe("MCP Servers", () => {
    it("should load multiple MCP servers", async () => {
      const path = writeConfig("multi.json", {
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
          },
          slack: {
            command: "npx",
            args: ["-y", "@slack/mcp"],
          },
          fetch: {
            command: "uvx",
            args: ["mcp-server-fetch"],
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.mcps.length, 3);
      const names = config.mcps.map((m) => m.name);
      assert.ok(names.includes("github"));
      assert.ok(names.includes("slack"));
      assert.ok(names.includes("fetch"));
    });

    it("should handle MCP with no args", async () => {
      const path = writeConfig("no-args.json", {
        mcpServers: {
          simple: {
            command: "/usr/bin/mcp-server",
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.mcps[0].command, "/usr/bin/mcp-server");
      assert.strictEqual(config.mcps[0].args, undefined);
    });

    it("should handle MCP with tools allowlist", async () => {
      const path = writeConfig("tools-filter.json", {
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            tools: ["list_issues", "create_issue"],
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.mcps[0].name, "github");
      assert.deepStrictEqual(config.mcps[0].tools, [
        "list_issues",
        "create_issue",
      ]);
    });

    it("should handle MCP with resources disabled", async () => {
      const path = writeConfig("resources-disabled.json", {
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            resources: false,
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.mcps[0].resources, false);
    });

    it("should handle MCP with prompts disabled", async () => {
      const path = writeConfig("prompts-disabled.json", {
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            prompts: false,
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.mcps[0].prompts, false);
    });

    it("should default resources and prompts to undefined (enabled)", async () => {
      const path = writeConfig("defaults-enabled.json", {
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.mcps[0].resources, undefined);
      assert.strictEqual(config.mcps[0].prompts, undefined);
    });

    it("should handle MCP without tools (all tools allowed)", async () => {
      const path = writeConfig("no-tools-filter.json", {
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
          },
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.mcps[0].tools, undefined);
    });
  });

  describe("Error Handling", () => {
    it("should return defaults when config file not found", async () => {
      const { loadConfig } = await import("../../../src/config/loader.js");

      const { config, warnings } = loadConfig("/nonexistent/path/config.json");

      assert.strictEqual(config.server.port, 8080);
      assert.strictEqual(config.auth, undefined);
      assert.strictEqual(config.storage, undefined);
      assert.deepStrictEqual(config.mcps, []);
      assert.ok(
        warnings.some((w) => w.includes("No authentication configured")),
      );
    });

    it("should throw on invalid JSON", async () => {
      const path = writeConfig("invalid.json", "{ not valid json");

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => {
        loadConfig(path);
      }, /Invalid JSON/);
    });

    it("should throw on unknown auth type", async () => {
      const path = writeConfig("unknown-auth.json", {
        auth: {
          type: "api-key",
          apiKey: "some-key-here-12345",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /Invalid configuration/);
    });

    it("should throw on unknown fields", async () => {
      const path = writeConfig("unknown-field.json", {
        auth: {
          type: "apikey",
          apiKey: "valid-key-here-12345",
          unknownField: "should fail",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /Invalid configuration/);
    });

    it("should throw on apikey without key", async () => {
      const path = writeConfig("apikey-no-key.json", {
        auth: {
          type: "apikey",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /Invalid configuration/);
    });

    it("should throw on invalid API key format (too short)", async () => {
      const path = writeConfig("invalid-apikey.json", {
        auth: {
          type: "apikey",
          apiKey: "short",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /at least 16 characters/);
    });

    it("should throw on API key with invalid characters", async () => {
      const path = writeConfig("invalid-apikey-chars.json", {
        auth: {
          type: "apikey",
          apiKey: "key!@#$%^&*()12345678",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /must contain only/);
    });

    it("should accept valid API key format", async () => {
      const path = writeConfig("valid-apikey.json", {
        auth: {
          type: "apikey",
          apiKey: "sk_live_abc123XYZ789",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.auth?.type, "apikey");
      if (config.auth?.type === "apikey") {
        assert.strictEqual(config.auth.apiKey, "sk_live_abc123XYZ789");
      }
    });

    it("should throw on oauth without users, clients, or dynamicRegistration", async () => {
      const path = writeConfig("oauth-empty.json", {
        auth: {
          type: "oauth",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /OAuth requires/);
    });

    it("should throw on client_credentials without clientSecret", async () => {
      const path = writeConfig("m2m-no-secret.json", {
        auth: {
          type: "oauth",
          clients: [
            {
              clientId: "m2m-app",
              grantType: "client_credentials",
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /clientSecret is required/);
    });

    it("should throw on authorization_code without redirectUris", async () => {
      const path = writeConfig("auth-code-no-redirect.json", {
        auth: {
          type: "oauth",
          clients: [
            {
              clientId: "web-app",
              grantType: "authorization_code",
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /redirectUris is required/);
    });

    it("should throw on invalid redirect URI format", async () => {
      const path = writeConfig("invalid-redirect.json", {
        auth: {
          type: "oauth",
          clients: [
            {
              clientId: "web-app",
              grantType: "authorization_code",
              redirectUris: ["not-a-valid-url"],
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /Invalid redirect URI/);
    });
  });

  describe("Log Config", () => {
    it("should parse log configuration", async () => {
      const path = writeConfig("log.json", {
        log: {
          level: "debug",
          format: "json",
          redactSecrets: false,
          mcpDebug: true,
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.log?.level, "debug");
      assert.strictEqual(config.log?.format, "json");
      assert.strictEqual(config.log?.redactSecrets, false);
      assert.strictEqual(config.log?.mcpDebug, true);
    });

    it("should reject invalid log level", async () => {
      const path = writeConfig("invalid-log-level.json", {
        log: {
          level: "verbose",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /Invalid configuration/);
    });
  });

  describe("Storage Config", () => {
    it("should parse memory storage config", async () => {
      const path = writeConfig("memory-storage.json", {
        storage: {
          type: "memory",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.storage?.type, "memory");
    });

    it("should parse sqlite storage config", async () => {
      const path = writeConfig("sqlite-storage.json", {
        storage: {
          type: "sqlite",
          path: "./data/test.db",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);

      assert.strictEqual(config.storage?.type, "sqlite");
      if (config.storage?.type === "sqlite") {
        assert.strictEqual(config.storage.path, "./data/test.db");
      }
    });

    it("should reject unknown storage type", async () => {
      const path = writeConfig("invalid-storage.json", {
        storage: {
          type: "redis",
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");

      assert.throws(() => loadConfig(path), /Invalid configuration/);
    });
  });

  describe("Config Warnings", () => {
    it("should warn when storage is configured without oauth", async () => {
      const path = writeConfig("warn-storage.json", {
        auth: {
          type: "apikey",
          apiKey: "sk_live_abc123XYZ789",
        },
        storage: { type: "memory" },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { warnings } = loadConfig(path);

      assert.ok(warnings.some((w) => w.includes("Storage config ignored")));
    });

    it("should warn when no auth configured", async () => {
      const path = writeConfig("warn-no-auth.json", {
        server: { port: 8080 },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { warnings } = loadConfig(path);

      assert.ok(
        warnings.some((w) => w.includes("No authentication configured")),
      );
    });

    it("should not warn on storage with oauth", async () => {
      const path = writeConfig("warn-storage-oauth.json", {
        auth: {
          type: "oauth",
          identityProviders: [
            {
              type: "local",
              users: [
                {
                  username: "admin",
                  password:
                    "$2a$12$M0egBmBjQKt3iyHMPOV49.SpiTeJtsW6Ktjy3IeuXbxX5lCFHivW2",
                },
              ],
            },
          ],
        },
        storage: { type: "memory" },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { warnings } = loadConfig(path);

      assert.ok(!warnings.some((w) => w.includes("Storage config ignored")));
    });

    it("should warn when no MCPs configured", async () => {
      const path = writeConfig("warn-no-mcps.json", {
        server: { port: 8080 },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { warnings } = loadConfig(path);

      assert.ok(warnings.some((w) => w.includes("No MCPs configured")));
    });

    it("should warn on unhashed user password", async () => {
      const path = writeConfig("warn-password.json", {
        auth: {
          type: "oauth",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: "password123" }],
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { warnings } = loadConfig(path);

      assert.ok(
        warnings.some(
          (w) => w.includes('User "admin"') && w.includes("not hashed"),
        ),
      );
    });

    it("should not warn on bcrypt hashed password", async () => {
      const hashed = bcrypt.hashSync("password123", 10);
      const path = writeConfig("warn-password-hashed.json", {
        auth: {
          type: "oauth",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: hashed }],
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { warnings } = loadConfig(path);

      assert.ok(!warnings.some((w) => w.includes("not hashed")));
    });
  });

  describe("OAuth Configurations", () => {
    it("should accept oauth with identityProviders only", async () => {
      const path = writeConfig("oauth-users.json", {
        auth: {
          type: "oauth",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: "password123" }],
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);
      assert.strictEqual(config.auth?.type, "oauth");
    });

    it("should accept oauth with dynamicRegistration and identityProviders", async () => {
      const path = writeConfig("oauth-dynamic.json", {
        auth: {
          type: "oauth",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: "password123" }],
            },
          ],
          dynamicRegistration: true,
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);
      assert.strictEqual(config.auth?.type, "oauth");
    });

    it("should accept oauth with authorization_code client", async () => {
      const path = writeConfig("oauth-auth-code.json", {
        auth: {
          type: "oauth",
          clients: [
            {
              clientId: "web-app",
              redirectUris: ["https://app.example.com/callback"],
              grantType: "authorization_code",
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);
      assert.strictEqual(config.auth?.type, "oauth");
    });

    it("should accept oauth with client_credentials client", async () => {
      const path = writeConfig("oauth-client-creds.json", {
        auth: {
          type: "oauth",
          clients: [
            {
              clientId: "backend-service",
              clientSecret: "secret123",
              grantType: "client_credentials",
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);
      assert.strictEqual(config.auth?.type, "oauth");
    });

    it("should accept oauth with mixed grant types", async () => {
      const path = writeConfig("oauth-mixed.json", {
        auth: {
          type: "oauth",
          clients: [
            {
              clientId: "web-app",
              redirectUris: ["https://app.example.com/callback"],
              grantType: "authorization_code",
            },
            {
              clientId: "backend-service",
              clientSecret: "secret123",
              grantType: "client_credentials",
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);
      assert.strictEqual(config.auth?.type, "oauth");
      if (config.auth?.type === "oauth") {
        assert.strictEqual(config.auth.clients?.length, 2);
      }
    });

    it("should accept oauth with optional issuer", async () => {
      const path = writeConfig("oauth-issuer.json", {
        auth: {
          type: "oauth",
          issuer: "https://example.com",
          identityProviders: [
            {
              type: "local",
              users: [{ username: "admin", password: "password123" }],
            },
          ],
        },
      });

      const { loadConfig } = await import("../../../src/config/loader.js");
      const { config } = loadConfig(path);
      assert.strictEqual(config.auth?.type, "oauth");
      if (config.auth?.type === "oauth") {
        assert.strictEqual(config.auth.issuer, "https://example.com");
      }
    });
  });
});
