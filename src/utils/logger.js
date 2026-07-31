/**
 * Logger module using Pino with redaction for sensitive data
 * Produces JSON logs in production, pretty-printed logs in development
 *
 * Call convention: object first, message second.
 *     logger.error({ err }, "Failed to refresh server data");
 * Pino treats a leading string as the message and any further arguments as
 * printf interpolation values, so `logger.error("Failed:", err)` silently
 * discards the error and loses its stack. The `no-restricted-syntax` rules in
 * eslint.config.js enforce the object-first form.
 *
 * Always log through one of the exported child loggers so every line carries a
 * `module` binding; that binding is what makes per-subsystem filtering possible.
 */

import pino from "pino";

import { DEFAULT_LOG_LEVEL, LOG_LEVELS, logLevelSchema } from "../schemas/envSchema.js";

/**
 * Resolve the configured log level from the environment.
 * The accepted levels are declared with the rest of the environment contract in
 * schemas/envSchema.js, but applied here rather than in the fatal validation
 * path: pino throws on an unrecognized level at import time, before any logger
 * exists to report why, so an unusable value degrades to the default instead of
 * stopping the process.
 * @returns {{ level: string, invalid?: string }} - Resolved level, plus the rejected value if any
 */
function resolveLogLevel() {
    const raw = process.env.LOG_LEVEL;
    const result = logLevelSchema.safeParse(raw);

    if (result.success) {
        return { level: result.data };
    }

    return { invalid: raw, level: DEFAULT_LOG_LEVEL };
}

const { invalid: invalidLogLevel, level: logLevel } = resolveLogLevel();

/**
 * Create a Pino logger with redaction configured
 * In development (TTY output), uses pino-pretty for readable logs
 * In production, outputs JSON for log aggregation
 */
function createLogger() {
    const isDevelopment = process.stdout.isTTY;

    // Matches object keys only, not tokens interpolated into a message string.
    // fast-redact is case sensitive and `*` is exactly one level, no prefix globs.
    const redactPaths = [
        "token",
        "*.token",
        "*.*.token",
        "DISCORD_TOKEN",
        "*.DISCORD_TOKEN",
        "*.*.DISCORD_TOKEN",
        "authorization",
        "*.authorization",
        "*.*.authorization",
        "Authorization",
        "*.Authorization",
        "*.*.Authorization"
    ];

    // Base pino configuration
    const baseConfig = {
        level: logLevel,
        redact: {
            censor: "**REDACTED**",
            paths: redactPaths
        },
        timestamp: pino.stdTimeFunctions.isoTime
    };

    // Add pretty printing for development
    if (isDevelopment && process.env.NODE_ENV !== "production") {
        try {
            return pino({
                ...baseConfig,
                transport: {
                    options: {
                        colorize: true,
                        customColors: "fatal:red,error:red,warn:yellow,info:green,debug:gray,trace:gray",
                        ignore: "pid,hostname",
                        messageFormat: "({ts}) {level}: {msg}",
                        translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l o"
                    },
                    target: "pino-pretty"
                }
            });
        } catch {
            // pino-pretty is not installed; fall through to JSON logging.
        }
    }

    // Production: JSON logs
    return pino(baseConfig);
}

// Create the main logger instance
const logger = createLogger();

// Create child loggers for different modules with contextual bindings
export const botLogger = logger.child({ module: "bot" });
export const commandLogger = logger.child({ module: "commands" });
export const dbLogger = logger.child({ module: "database" });
export const serviceLogger = logger.child({ module: "services" });
export const configLogger = logger.child({ module: "config" });
export const mainLogger = logger.child({ module: "main" });

// Surface a bad LOG_LEVEL now that there is a logger to report it with.
if (invalidLogLevel) {
    configLogger.warn(
        { configuredLevel: invalidLogLevel, effectiveLevel: logLevel, validLevels: LOG_LEVELS },
        "Invalid LOG_LEVEL; falling back to default"
    );
}
