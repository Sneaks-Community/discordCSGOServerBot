/**
 * Logger module using Pino with redaction for sensitive data
 * Produces JSON logs in production, pretty-printed logs in development
 */

import pino from "pino";

/**
 * Create a Pino logger with redaction configured
 * In development (TTY output), uses pino-pretty for readable logs
 * In production, outputs JSON for log aggregation
 */
function createLogger() {
    const isDevelopment = process.stdout.isTTY;

    // Paths to redact from all log output
    const redactPaths = [
        "discord.token",
        "discord.token*",
        "DISCORD_TOKEN",
        "DISCORD_TOKEN*"
    ];

    // Base pino configuration
    const baseConfig = {
        level: process.env.LOG_LEVEL || "info",
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
            paths: redactPaths,
            censor: "**REDACTED**"
        },
        formatters: {
            level: (label) => ({ level: label, levelNum: label === "info" ? 30 : label === "warn" ? 40 : label === "error" ? 50 : 20 })
        }
    };

    // Add pretty printing for development
    if (isDevelopment && process.env.NODE_ENV !== "production") {
        return pino({
            ...baseConfig,
            transport: {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l o",
                    ignore: "pid,hostname",
                    messageFormat: "({ts}) {level}: {msg}",
                    customColors: "info:green,warn:yellow,error:red,debug:gray"
                }
            }
        });
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

// Export convenience methods matching Pino's API
export const log = logger.info.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
export const debug = logger.debug.bind(logger);
export const fatal = logger.fatal.bind(logger);

// Export the full logger for child creation or advanced usage
export default logger;
