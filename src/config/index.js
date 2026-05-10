/**
 * Configuration module - main entry point
 * Handles config loading and validation from environment variables
 */

import { config, CONFIG_VALUES, REQUIRED_PERMISSIONS } from "./config.js";
import { configLogger, error } from "../utils/logger.js";

export { config, CONFIG_VALUES, REQUIRED_PERMISSIONS };

/**
 * Validate required configuration fields
 * Logs errors and exits if critical fields are missing
 */
export function validateConfig() {
    const errors = [];
    const warnings = [];

    // Critical: Discord token
    if (!config.discord?.token || typeof config.discord.token !== "string" || config.discord.token.trim() === "") {
        errors.push("DISCORD_TOKEN environment variable is missing or empty");
    }

    // Critical: Security admin IDs
    if (!config.security?.adminUserIds || !Array.isArray(config.security.adminUserIds) || config.security.adminUserIds.length === 0) {
        warnings.push("ADMIN_USER_IDS environment variable is missing or empty - admin commands will be inaccessible");
    } else {
        // Validate each admin ID format
        for (const id of config.security.adminUserIds) {
            if (typeof id !== "string" || !/^\d{17,19}$/.test(id)) {
                warnings.push(`Invalid admin user ID format: "${id}" - should be 17-19 digits`);
            }
        }
    }

    // Important: Logging configuration
    if (!config.logging?.guildID || typeof config.logging.guildID !== "string" || config.logging.guildID.trim() === "") {
        warnings.push("LOG_GUILD_ID environment variable is missing - logging will be disabled");
    }
    if (!config.logging?.channelID || typeof config.logging.channelID !== "string" || config.logging.channelID.trim() === "") {
        warnings.push("LOG_CHANNEL_ID environment variable is missing - logging will be disabled");
    }

    // Important: Fallback notification configuration
    if (!config.fallback?.guildID || typeof config.fallback.guildID !== "string" || config.fallback.guildID.trim() === "") {
        warnings.push("FALLBACK_GUILD_ID environment variable is missing - fallback notifications will be disabled");
    }
    if (!config.fallback?.channelID || typeof config.fallback.channelID !== "string" || config.fallback.channelID.trim() === "") {
        warnings.push("FALLBACK_CHANNEL_ID environment variable is missing - fallback notifications will be disabled");
    }

    // Important: Embeds configuration
    if (!config.embeds || !Array.isArray(config.embeds) || config.embeds.length === 0) {
        warnings.push("EMBEDS environment variable is missing or empty - server list embeds will not be updated");
    } else {
        for (let i = 0; i < config.embeds.length; i++) {
            const embed = config.embeds[i];
            if (!embed.channelID || typeof embed.channelID !== "string" || embed.channelID.trim() === "") {
                warnings.push(`EMBEDS[${i}].channelID is missing or invalid`);
            }
            if (!embed.messageID || typeof embed.messageID !== "string" || embed.messageID.trim() === "") {
                warnings.push(`EMBEDS[${i}].messageID is missing or invalid`);
            }
        }
    }

    // Important: Server update configuration
    if (!config.serverUpdate?.intervalSeconds || config.serverUpdate.intervalSeconds < 30) {
        warnings.push("SERVER_UPDATE_INTERVAL should be at least 30 seconds");
    }

    // Log warnings
    for (const warning of warnings) {
        configLogger.warn(warning);
    }

    // Exit on errors
    if (errors.length > 0) {
        error("\n========================================");
        error("CRITICAL CONFIGURATION ERRORS:");
        for (const err of errors) {
            error(`  - ${err}`);
        }
        error("========================================\n");
        error("Please set the required environment variables.");
        error("See .env.example for reference.");
        process.exit(1);
    }

    return { warnings, errors };
}
