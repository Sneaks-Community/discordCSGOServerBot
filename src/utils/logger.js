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
        formatters: {
            level: (label) => ({ level: label, levelNum: label === "info" ? 30 : label === "warn" ? 40 : label === "error" ? 50 : 20 })
        },
        level: process.env.LOG_LEVEL || "info",
        redact: {
            censor: "**REDACTED**",
            paths: redactPaths
        },
        timestamp: pino.stdTimeFunctions.isoTime
    };

    // Add pretty printing for development
    if (isDevelopment && process.env.NODE_ENV !== "production") {
        return pino({
            ...baseConfig,
            transport: {
                options: {
                    colorize: true,
                    customColors: "info:green,warn:yellow,error:red,debug:gray",
                    ignore: "pid,hostname",
                    messageFormat: "({ts}) {level}: {msg}",
                    translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l o"
                },
                target: "pino-pretty"
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
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);

// Export the full logger for child creation or advanced usage
export default logger;
