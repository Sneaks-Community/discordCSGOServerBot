/**
 * Configuration module - main entry point
 * Handles config loading and validation from environment variables
 */

import { configLogger } from "../utils/logger.js";
import { config, CONFIG_VALUES, REQUIRED_PERMISSIONS } from "./config.js";

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

    // Critical: Security admin role ID
    if (!config.security?.adminRoleId || typeof config.security.adminRoleId !== "string" || config.security.adminRoleId.trim() === "") {
        warnings.push("ADMIN_ROLE_ID environment variable is missing or empty - admin commands will be inaccessible");
    } else if (!/^\d{17,19}$/.test(config.security.adminRoleId)) {
        warnings.push(`Invalid admin role ID format: "${config.security.adminRoleId}" - should be 17-19 digits`);
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
        configLogger.fatal(
            { errors },
            "Critical configuration errors; set the required environment variables (see .env.example)"
        );
        process.exit(1);
    }

    return { errors, warnings };
}
