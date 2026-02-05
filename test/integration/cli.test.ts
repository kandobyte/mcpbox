import assert from "node:assert";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const TEST_DIR = join(import.meta.dirname, ".tmp-cli");
const CLI_PATH = join(import.meta.dirname, "..", "..", "src", "index.ts");

function writeConfig(filename: string, content: object): string {
  const path = join(TEST_DIR, filename);
  writeFileSync(path, JSON.stringify(content, null, 2));
  return path;
}

function runCli(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      process.execPath,
      ["--import", "tsx", CLI_PATH, ...args],
      {
        cwd: join(import.meta.dirname, "..", ".."),
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    // Set timeout to kill process if it doesn't exit
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
    }, 5000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

interface ServerHandle {
  port: number;
  process: ChildProcess;
  kill: () => Promise<void>;
}

/**
 * Start the server and wait until it responds to health checks.
 * Returns a handle to interact with and kill the server.
 */
function startServer(args: string[], port: number): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      ["--import", "tsx", CLI_PATH, ...args],
      {
        cwd: join(import.meta.dirname, "..", ".."),
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let resolved = false;
    let killed = false;

    const cleanup = (): Promise<void> => {
      if (killed) return Promise.resolve();
      killed = true;

      return new Promise<void>((resolveKill) => {
        const forceKillTimeout = setTimeout(() => {
          proc.kill("SIGKILL");
        }, 1000);

        proc.once("close", () => {
          clearTimeout(forceKillTimeout);
          resolveKill();
        });

        proc.kill("SIGTERM");
      });
    };

    // Poll the health endpoint to detect when server is ready
    const pollHealth = async () => {
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          const res = await fetch(`http://localhost:${port}/health`);
          if (res.ok) {
            resolved = true;
            resolve({ port, process: proc, kill: cleanup });
            return;
          }
        } catch {
          // Server not ready yet
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      cleanup();
      reject(new Error(`Server did not start on port ${port}`));
    };

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        reject(
          new Error(`Server exited with code ${code} before becoming ready`),
        );
      }
    });

    pollHealth();
  });
}

describe("CLI", () => {
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

  describe("Help Flag", () => {
    it("should display help with -h", async () => {
      const { code, stdout } = await runCli(["-h"]);

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes("mcpbox"));
      assert.ok(stdout.includes("Usage:"));
      assert.ok(stdout.includes("--config"));
      assert.ok(stdout.includes("--help"));
      assert.ok(stdout.includes("--version"));
    });

    it("should display help with --help", async () => {
      const { code, stdout } = await runCli(["--help"]);

      assert.strictEqual(code, 0);
      assert.ok(stdout.includes("mcpbox"));
    });
  });

  describe("Version Flag", () => {
    it("should display version with -v", async () => {
      const { code, stdout } = await runCli(["-v"]);

      assert.strictEqual(code, 0);
      // Version should be a semver-like string
      assert.ok(/\d+\.\d+\.\d+/.test(stdout.trim()));
    });

    it("should display version with --version", async () => {
      const { code, stdout } = await runCli(["--version"]);

      assert.strictEqual(code, 0);
      assert.ok(/\d+\.\d+\.\d+/.test(stdout.trim()));
    });
  });

  describe("Config Loading", () => {
    it("should start server with -c flag on configured port", async () => {
      const port = 19001;
      const configPath = writeConfig("valid.json", {
        server: { port },
      });

      const server = await startServer(["-c", configPath], port);
      try {
        // Verify server responds on the configured port
        const res = await fetch(`http://localhost:${port}/health`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.status, "ok");
      } finally {
        await server.kill();
      }
    });

    it("should start server with --config flag on configured port", async () => {
      const port = 19002;
      const configPath = writeConfig("config-flag.json", {
        server: { port },
      });

      const server = await startServer(["--config", configPath], port);
      try {
        // Verify server responds on the configured port
        const res = await fetch(`http://localhost:${port}/health`);
        assert.strictEqual(res.status, 200);
      } finally {
        await server.kill();
      }
    });

    it("should start with defaults for non-existent config file", async () => {
      // Use a non-existent config but override port via a real config
      // Actually, with defaults it will use port 8080, so let's just verify it starts
      const server = await startServer(
        ["-c", "/nonexistent/config.json"],
        8080,
      );
      try {
        const res = await fetch("http://localhost:8080/health");
        assert.strictEqual(res.status, 200);
      } finally {
        await server.kill();
      }
    });

    it("should exit with code 1 for invalid JSON config", async () => {
      const configPath = join(TEST_DIR, "invalid.json");
      writeFileSync(configPath, "{ not valid json");

      const { code } = await runCli(["-c", configPath]);
      assert.strictEqual(code, 1);
    });
  });

  describe("Positional Config Argument", () => {
    it("should accept config path as positional argument", async () => {
      const port = 19003;
      const configPath = writeConfig("positional.json", {
        server: { port },
      });

      const server = await startServer([configPath], port);
      try {
        // Verify server responds on the configured port
        const res = await fetch(`http://localhost:${port}/health`);
        assert.strictEqual(res.status, 200);
      } finally {
        await server.kill();
      }
    });
  });
});
