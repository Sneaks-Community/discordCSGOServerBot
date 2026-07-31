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

/**
 * Longest a flush may wait before the caller exits without it. A lost log line is
 * better than a process that will not die.
 */
const FLUSH_TIMEOUT_MS = 1000;

/**
 * Drain the logger before the process exits.
 *
 * In development createLogger() uses a pino `transport`, which writes through a
 * worker thread, and pino documents that a process.exit() in the same tick as a log
 * call discards whatever that worker still holds. Unflushed, the most valuable line
 * the bot ever writes ("here is why it is exiting") is the one most likely to vanish
 * on a developer's terminal. Production JSON logging to stdout is synchronous, which
 * is why this hides rather than announces itself.
 * @returns {Promise<void>} Resolves once the logger has drained, or on timeout
 */
export function flushLogs() {
    return new Promise((resolve) => {
        // Deliberately not unref'd: thread-stream waits on the worker with
        // Atomics.waitAsync, which does not hold the event loop open, so an unref'd
        // timer lets Node exit the moment the loop empties and the flush never
        // settles. Cleared below as soon as it does, so this costs nothing.
        const timer = setTimeout(resolve, FLUSH_TIMEOUT_MS);

        // A flush error is not actionable here; the caller is already on its way out.
        logger.flush(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

// Surface a bad LOG_LEVEL now that there is a logger to report it with.
if (invalidLogLevel) {
    configLogger.warn(
        { configuredLevel: invalidLogLevel, effectiveLevel: logLevel, validLevels: LOG_LEVELS },
        "Invalid LOG_LEVEL; falling back to default"
    );
}
