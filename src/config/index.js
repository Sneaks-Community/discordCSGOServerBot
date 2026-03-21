/**
 * Configuration module - main entry point
 * Handles config loading and validation
 */

import config from "../../config.json" with { type: "json" };

export { CONFIG_VALUES, REQUIRED_PERMISSIONS, config } from "./constants.js";

/**
 * Validate required configuration fields
 * Logs errors and exits if critical fields are missing
 */
export function validateConfig() {
    const errors = [];
    const warnings = [];

    // Critical: Discord token
    if (!config.discord?.token || typeof config.discord.token !== "string" || config.discord.token.trim() === "") {
        errors.push("config.discord.token is missing or empty");
    }

    // Critical: Security admin IDs
    if (!config.security?.adminUserIds || !Array.isArray(config.security.adminUserIds) || config.security.adminUserIds.length === 0) {
        warnings.push("config.security.adminUserIds is missing or empty - admin commands will be inaccessible");
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
        warnings.push("config.logging.guildID is missing - logging will be disabled");
    }
    if (!config.logging?.channelID || typeof config.logging.channelID !== "string" || config.logging.channelID.trim() === "") {
        warnings.push("config.logging.channelID is missing - logging will be disabled");
    }

    // Important: Fallback notification configuration
    if (!config.fallback?.guildID || typeof config.fallback.guildID !== "string" || config.fallback.guildID.trim() === "") {
        warnings.push("config.fallback.guildID is missing - fallback notifications will be disabled");
    }
    if (!config.fallback?.channelID || typeof config.fallback.channelID !== "string" || config.fallback.channelID.trim() === "") {
        warnings.push("config.fallback.channelID is missing - fallback notifications will be disabled");
    }

    // Important: Embeds configuration
    if (!config.embeds || !Array.isArray(config.embeds) || config.embeds.length === 0) {
        warnings.push("config.embeds is missing or empty - server list embeds will not be updated");
    } else {
        for (let i = 0; i < config.embeds.length; i++) {
            const embed = config.embeds[i];
            if (!embed.channelID || typeof embed.channelID !== "string" || embed.channelID.trim() === "") {
                warnings.push(`config.embeds[${i}].channelID is missing or invalid`);
            }
            if (!embed.messageID || typeof embed.messageID !== "string" || embed.messageID.trim() === "") {
                warnings.push(`config.embeds[${i}].messageID is missing or invalid`);
            }
        }
    }

    // Important: Server update configuration
    if (!config.serverUpdate?.intervalSeconds || config.serverUpdate.intervalSeconds < 30) {
        warnings.push("config.serverUpdate.intervalSeconds should be at least 30 seconds");
    }

    // Log warnings
    for (const warning of warnings) {
        console.warn(`Configuration warning: ${warning}`);
    }

    // Exit on errors
    if (errors.length > 0) {
        console.error("\n========================================");
        console.error("CRITICAL CONFIGURATION ERRORS:");
        for (const error of errors) {
            console.error(`  - ${error}`);
        }
        console.error("========================================\n");
        console.error("Please fix these errors in your config.json file.");
        console.error("See config.json.example for reference.");
        process.exit(1);
    }

    return { warnings, errors };
}