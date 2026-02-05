import { existsSync, readFileSync } from "node:fs";
import type { ZodError, ZodIssue } from "zod";
import {
  type Config,
  type LoadConfigResult,
  type McpConfig,
  type McpServerEntry,
  RawConfigSchema,
} from "./schema.js";

export type { LoadConfigResult } from "./schema.js";

function substituteEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVars);
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }
  return obj;
}

function parseMcpServers(
  mcpServers: Record<string, McpServerEntry>,
): McpConfig[] {
  const mcps: McpConfig[] = [];
  for (const [name, entry] of Object.entries(mcpServers)) {
    mcps.push({
      name,
      command: entry.command,
      args: entry.args,
      env: entry.env,
      tools: entry.tools,
    });
  }
  return mcps;
}

function formatZodIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  const code = issue.code;

  // Handle discriminated union errors (wrong type value)
  if (code === "invalid_union" && "discriminator" in issue) {
    const discriminator = issue.discriminator as string;
    // Get valid options from the schema based on the discriminator
    if (discriminator === "type" && path === "auth.type") {
      return `${path}: must be one of: "none", "apikey", "oauth"`;
    }
    if (discriminator === "type" && path === "storage.type") {
      return `${path}: must be one of: "memory", "sqlite"`;
    }
    return `${path}: invalid value for "${discriminator}"`;
  }

  // Handle unrecognized keys
  if (code === "unrecognized_keys" && "keys" in issue) {
    const keys = (issue.keys as string[]).map((k) => `"${k}"`).join(", ");
    const location = path === "" ? "config" : path;
    return `${location}: unknown field${(issue.keys as string[]).length > 1 ? "s" : ""} ${keys}`;
  }

  // Handle missing required fields
  if (code === "invalid_type" && "expected" in issue) {
    const expected = issue.expected as string;
    if (issue.message.includes("received undefined")) {
      return `${path}: required field missing`;
    }
    return `${path}: expected ${expected}`;
  }

  // Handle enum errors (Zod v4 uses "invalid_value" with options)
  if ("options" in issue && Array.isArray(issue.options)) {
    const options = (issue.options as string[]).map((o) => `"${o}"`).join(", ");
    return `${path}: must be one of: ${options}`;
  }

  // Clean up Zod's default messages
  const message = issue.message;

  // "Invalid option: expected one of X" -> cleaner format
  if (message.startsWith("Invalid option: expected one of ")) {
    const options = message.replace("Invalid option: expected one of ", "");
    return `${path}: must be one of: ${options.replace(/\|/g, ", ").replace(/"/g, "")}`;
  }

  return `${path}: ${message}`;
}

function formatZodError(error: ZodError): string {
  // Filter out "missing required field" errors if there's an "unrecognized key" error at the same path
  // This happens when someone uses wrong field name - we want to show the typo, not the missing field
  const issues = error.issues;
  const unrecognizedPaths = new Set<string>();

  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      const basePath = issue.path.join(".");
      unrecognizedPaths.add(basePath);
    }
  }

  const filteredIssues = issues.filter((issue) => {
    // Keep unrecognized_keys errors
    if (issue.code === "unrecognized_keys") return true;

    // Filter out "required field missing" if there's an unrecognized key at the parent path
    if (
      issue.code === "invalid_type" &&
      issue.message.includes("received undefined")
    ) {
      const parentPath = issue.path.slice(0, -1).join(".");
      if (unrecognizedPaths.has(parentPath)) {
        return false;
      }
    }

    return true;
  });

  const formatted = filteredIssues.map(formatZodIssue);
  return `Invalid configuration:\n${formatted.map((f) => `  - ${f}`).join("\n")}`;
}

export function resolveConfigPath(configPath?: string): string {
  return configPath ?? "mcpbox.json";
}

function checkConfig(config: Config): string[] {
  const warnings: string[] = [];

  if (!config.auth) {
    warnings.push("No authentication configured");
  }

  if (config.mcps.length === 0) {
    warnings.push("No MCPs configured");
  }

  if (config.storage && config.auth?.type !== "oauth") {
    warnings.push(
      "Storage config ignored: only used with OAuth authentication",
    );
  }

  return warnings;
}

export function loadConfig(configPath: string): LoadConfigResult {
  if (!existsSync(configPath)) {
    const config: Config = {
      server: { port: 8080 },
      auth: undefined,
      storage: undefined,
      log: undefined,
      mcps: [],
    };
    return { config, warnings: checkConfig(config) };
  }

  const content = readFileSync(configPath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(
      `Invalid JSON in config file: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Substitute environment variables before validation
  const substituted = substituteEnvVars(parsed);

  // Validate with Zod schema
  const result = RawConfigSchema.safeParse(substituted);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }

  const raw = result.data;
  const mcps = raw.mcpServers ? parseMcpServers(raw.mcpServers) : [];

  const config: Config = {
    server: raw.server ?? { port: 8080 },
    auth: raw.auth,
    storage: raw.storage,
    log: raw.log,
    mcps,
  };

  return { config, warnings: checkConfig(config) };
}
