#!/usr/bin/env node
/**
 * MCP Conformance Test Runner
 *
 * Starts the mcpbox server and runs the official MCP conformance test suite against it.
 * Uses @modelcontextprotocol/conformance for protocol compliance testing.
 *
 * Usage:
 *   npm run test:conformance
 *   npm run test:conformance -- --scenario server-initialize
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONFORMANCE_PORT = 8077;
const CONFORMANCE_URL = `http://localhost:${CONFORMANCE_PORT}/mcp`;
const TEST_DIR = join(import.meta.dirname, ".tmp-conformance");
const CONFIG_PATH = join(TEST_DIR, "config.json");
const EXPECTED_FAILURES_PATH = join(
  import.meta.dirname,
  "expected-failures.yaml",
);

// Path to our conformance test server that implements the required fixtures
const CONFORMANCE_SERVER_PATH = join(
  import.meta.dirname,
  "..",
  "mcp-servers",
  "conformance.ts",
);

// Conformance test configuration - no auth for simplicity
// Uses our custom conformance test server that implements the required fixtures
const TEST_CONFIG = {
  server: { port: CONFORMANCE_PORT },
  mcpServers: {
    test: {
      command: "npx",
      args: ["tsx", CONFORMANCE_SERVER_PATH],
    },
  },
};

let serverProcess: ChildProcess | null = null;

async function startServer(): Promise<void> {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(TEST_CONFIG, null, 2));

  const cliPath = join(import.meta.dirname, "..", "..", "src", "index.ts");

  return new Promise((resolve, reject) => {
    serverProcess = spawn("npx", ["tsx", cliPath, "-c", CONFIG_PATH], {
      cwd: join(import.meta.dirname, "..", ".."),
      env: {
        ...process.env,
        NO_COLOR: "1",
        // Internal: skip namespacing for conformance testing
        __MCPBOX_SKIP_NAMESPACE: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let started = false;

    serverProcess.stderr?.on("data", (data) => {
      const output = data.toString();
      if (!started && output.includes("listening")) {
        started = true;
        resolve();
      }
    });

    serverProcess.on("error", reject);
    serverProcess.on("close", (code) => {
      if (!started) {
        reject(new Error(`Server exited with code ${code} before starting`));
      }
    });

    // Timeout if server doesn't start
    setTimeout(() => {
      if (!started) {
        started = true;
        // Server might not log "listening", give it benefit of the doubt
        resolve();
      }
    }, 3000);
  });
}

async function stopServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    serverProcess = null;
  }

  try {
    rmSync(TEST_DIR, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function runConformance(): Promise<number> {
  // Get additional args passed to the script
  const args = process.argv.slice(2);

  const conformanceArgs = [
    "@modelcontextprotocol/conformance",
    "server",
    "--url",
    CONFORMANCE_URL,
  ];

  // Add expected failures baseline if it exists
  if (existsSync(EXPECTED_FAILURES_PATH)) {
    conformanceArgs.push("--expected-failures", EXPECTED_FAILURES_PATH);
    console.log(`Using expected failures from: ${EXPECTED_FAILURES_PATH}`);
  }

  // Add any user-provided args
  conformanceArgs.push(...args);

  console.log(`\nRunning: npx ${conformanceArgs.join(" ")}\n`);

  return new Promise((resolve) => {
    const proc = spawn("npx", conformanceArgs, {
      stdio: "inherit",
      env: process.env,
    });

    proc.on("close", (code) => {
      resolve(code ?? 1);
    });

    proc.on("error", (err) => {
      console.error("Failed to run conformance tests:", err);
      resolve(1);
    });
  });
}

async function main(): Promise<void> {
  console.log("MCP Conformance Test Runner");
  console.log("===========================\n");

  try {
    console.log("Starting mcpbox server...");
    await startServer();
    console.log(`Server running at ${CONFORMANCE_URL}\n`);

    const exitCode = await runConformance();

    await stopServer();
    process.exit(exitCode);
  } catch (error) {
    console.error("Error:", error);
    await stopServer();
    process.exit(1);
  }
}

// Handle Ctrl+C
process.on("SIGINT", async () => {
  console.log("\nInterrupted, cleaning up...");
  await stopServer();
  process.exit(130);
});

main();
