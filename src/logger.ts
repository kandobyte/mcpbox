import pino, { type Logger } from "pino";
import type { LogConfig } from "./config/types.js";

/**
 * Recursively redact sensitive patterns in strings within objects/arrays.
 * @package
 */
export function redactSensitiveStrings(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/(PASSWORD|SECRET|TOKEN|KEY|PIN)=\S*/gi, "$1=***");
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveStrings);
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactSensitiveStrings(value);
    }
    return result;
  }
  return obj;
}

function createLogger(config?: LogConfig): Logger {
  const level = config?.level ?? process.env.LOG_LEVEL ?? "info";
  const shouldRedact = config?.redactSecrets ?? true;
  const format = config?.format ?? "pretty";

  const options: pino.LoggerOptions = {
    level,
    transport:
      format === "pretty"
        ? {
            target: "pino-pretty",
            options: { colorize: true },
          }
        : undefined,
  };

  if (shouldRedact) {
    options.redact = {
      paths: [
        "*.password",
        "*.PASSWORD",
        "*.secret",
        "*.SECRET",
        "*.token",
        "*.TOKEN",
        "*.key",
        "*.KEY",
        "*.pin",
        "*.PIN",
        "*.client_secret",
      ],
      censor: "***",
    };
    options.hooks = {
      logMethod(inputArgs, method) {
        if (inputArgs.length >= 1 && typeof inputArgs[0] === "object") {
          inputArgs[0] = redactSensitiveStrings(inputArgs[0]);
        }
        return method.apply(this, inputArgs as Parameters<typeof method>);
      },
    };
  }

  return pino(options);
}

// Default logger for early startup (before config is loaded)
export let logger = createLogger();

// Reconfigure logger with loaded config
export function configureLogger(config?: LogConfig): void {
  logger = createLogger(config);
}
