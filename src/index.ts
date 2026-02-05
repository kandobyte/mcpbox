#!/usr/bin/env node
import {
  type LoadConfigResult,
  loadConfig,
  resolveConfigPath,
} from "./config/loader.js";
import { configureLogger, logger } from "./logger.js";
import { createServer } from "./server.js";
import { VERSION } from "./version.js";

function printHelp() {
  console.log(`
mcpbox - Expose MCP servers via HTTP

Usage:
  mcpbox [options]

Options:
  -c, --config <path>   Path to config file (default: mcpbox.json)
  -h, --help            Show this help message
  -v, --version         Show version
`);
}

function parseArgs(args: string[]): {
  config?: string;
  help: boolean;
  version: boolean;
} {
  const result: { config?: string; help: boolean; version: boolean } = {
    config: undefined,
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "-v" || arg === "--version") {
      result.version = true;
    } else if (arg === "-c" || arg === "--config") {
      result.config = args[++i];
    } else if (!arg.startsWith("-")) {
      // Positional arg = config path (backwards compat)
      result.config = arg;
    }
  }

  return result;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.version) {
  console.log(VERSION);
  process.exit(0);
}

const configPath = resolveConfigPath(args.config);

let config: LoadConfigResult["config"];
let warnings: LoadConfigResult["warnings"];
try {
  ({ config, warnings } = loadConfig(configPath));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  // Log to stderr directly since logger config isn't loaded yet
  console.error(`Failed to load config from ${configPath}:\n${message}`);
  process.exit(1);
}

// Reconfigure logger with settings from config
configureLogger(config.log);

logger.info(
  {
    mcps: config.mcps.map((m) => m.name),
    auth: config.auth?.type ?? "none",
  },
  "Config loaded",
);

for (const warning of warnings) {
  logger.warn(warning);
}

let closeServer: (() => Promise<void>) | undefined;
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn("Shutdown already in progress, forcing exit");
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    if (closeServer) {
      await closeServer();
    }
    process.exit(0);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      "Error during shutdown",
    );
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error(
    {
      error: error.message,
      stack: error.stack,
    },
    "Uncaught exception",
  );
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error(
    {
      reason: reason instanceof Error ? reason.message : String(reason),
    },
    "Unhandled rejection",
  );
  process.exit(1);
});

try {
  const { close } = await createServer(config);
  closeServer = close;
} catch (error) {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error),
    },
    "Failed to start server",
  );
  process.exit(1);
}
