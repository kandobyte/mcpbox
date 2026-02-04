// Server lifecycle utilities for integration tests.
//
// Two patterns for starting servers in tests:
//
// 1. In-process (this module): Uses createServer() directly.
//    Faster startup/shutdown, shares memory with test process.
//    Use for: handler tests, auth tests, MCP proxy tests.
//
// 2. CLI subprocess (cli.test.ts): Spawns node src/index.ts as child process.
//    Tests actual CLI argument parsing, isolated process.
//    Use for: CLI flag tests, config file loading tests.
//
// Most integration tests should use in-process for speed.
// Only use subprocess when testing CLI-specific behavior.

import { DELAYS } from "./constants.js";

export interface TestServer {
  close: () => Promise<void>;
}

let activeServer: TestServer | null = null;

// Start a test server with the given configuration.
export async function startServer(config: object): Promise<TestServer> {
  const { createServer } = await import("../../src/server.js");
  const server = await createServer(config);
  activeServer = server;
  await delay(DELAYS.SERVER_STARTUP);
  return server;
}

// Stop the currently active test server.
export async function stopServer(): Promise<void> {
  if (activeServer) {
    await activeServer.close();
    activeServer = null;
    await delay(DELAYS.SERVER_SHUTDOWN);
  }
}

// Promise-based delay utility.
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Make a JSON-RPC request to the MCP endpoint.
export async function mcpRequest(
  baseUrl: string,
  body: object,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Headers; json: object }> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const json = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : {};
  return { status: res.status, headers: res.headers, json };
}

// Make a form-encoded POST request.
export async function post(
  baseUrl: string,
  path: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// Make a JSON POST request.
export async function postJson(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// Make a GET request.
export async function get(
  baseUrl: string,
  path: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}
