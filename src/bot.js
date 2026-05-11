/**
 * Discord bot client setup and event handlers
 * Main bot module that initializes and runs the Discord client
 */

import Discord, { GatewayIntentBits } from "discord.js";

import { setFollowLogChannel } from "./commands/followCommands.js";
import { registerSlashCommands, handleInteraction } from "./commands/index.js";
import { config, CONFIG_VALUES, validateConfig } from "./config/index.js";
import { initDB, closeDB, unfollowAll } from "./db/index.js";
import { makeEmbed } from "./embeds/serverEmbeds.js";
import { startCleanupIntervals, clearCleanupIntervals } from "./services/cacheService.js";
import { notifyUsers, initNotificationService } from "./services/notificationService.js";
import { refresh, getServerData, updateServerData } from "./services/serverService.js";
import { botLogger, error, warn } from "./utils/logger.js";
import { validateChannelForEdit, validateChannelForSend } from "./utils/permissions.js";
import { withRetry } from "./utils/retry.js";

// Store interval references for cleanup during shutdown
let embedInterval = null;
let mapCheckInterval = null;

// Create bot client with v14 intents
const bot = new Discord.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ],
    token: config.discord.token
});

// Log channel for notifications
let logChannel = null;

/**
 * Initialize the bot and start all services
 */
export async function initBot() {
    // Validate configuration before starting
    validateConfig();

    // Initialize database before logging in
    await initDB();

    // Initialize notification service with bot instance
    initNotificationService(bot);

    // Login to Discord (token is redacted by Pino automatically)
    bot.login().catch(err => {
        error("Failed to login to Discord:", err.message);
        process.exit(1);
    });
}

/**
 * Bot ready event handler
 */
bot.on("ready", async () => {
    try {
        botLogger.info("Started as " + bot.user.tag);
        bot.user.setActivity("/follow <map> in #bot-commands");

        // Initialize logChannel with config values
        const guild = bot.guilds.cache.get(config.logging?.guildID);
        if (guild) {
            logChannel = guild.channels.cache.get(config.logging?.channelID);
            if (logChannel) {
                // Validate bot has required permissions in log channel
                const permCheck = validateChannelForSend(logChannel);
                if (!permCheck.valid) {
                    warn(`Log channel ${config.logging?.channelID} permission issue: ${permCheck.error}`);
                    logChannel = null; // Disable logging if permissions are missing
                }
            } else {
                warn(`Log channel ${config.logging?.channelID} not found in guild ${config.logging?.guildID}`);
            }
        } else {
            warn(`Guild ${config.logging?.guildID} not found`);
        }

        // Set log channel for follow commands
        setFollowLogChannel(logChannel);

        // Register slash commands
        await registerSlashCommands(bot);

        // Start the interval function
        await intervalFunction();

        // Start embed update loop (store reference for cleanup)
        embedInterval = setInterval(intervalFunction, CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS);

        // Start map change notification loop (store reference for cleanup)
        mapCheckInterval = setInterval(() => updateServerData(notifyUsers), CONFIG_VALUES.MAP_CHECK_INTERVAL_MS);

        // Start cleanup intervals for cache and rate limits
        startCleanupIntervals();
    } catch (err) {
        botLogger.error(err, "Failed during ready initialization");
        process.exit(1);
    }
});

/**
 * Interval function to refresh server data and update embeds
 */
async function intervalFunction() {
    try {
        await refresh();
    } catch (error) {
        error("Failed to refresh server data:", error);
        return; // Skip embed update if refresh fails
    }
    
    const serverData = getServerData();
    const embed = makeEmbed(serverData);

    // Process embeds in parallel with retry logic for faster updates
    await Promise.all(
        config.embeds.map(async (e) => {
            try {
                await withRetry(async () => {
                    const channel = await bot.channels.fetch(e.channelID);
                    
                    // Validate permissions before editing
                    const permCheck = validateChannelForEdit(channel);
                    if (!permCheck.valid) {
                        throw new Error(`Permission check failed for channel ${e.channelID}: ${permCheck.error}`);
                    }
                    
                    const message = await channel.messages.fetch(e.messageID);
                    await message.edit({ content: "\u200B", embeds: [embed] });
                });
            } catch (error) {
                error(`Failed to update embed in channel ${e.channelID} after retries:`, error);
            }
        })
    );
}

/**
 * Handle guild member remove event - clean up follows when member leaves
 */
bot.on("guildMemberRemove", async (member) => {
    await unfollowAll(member.id);
});

/**
 * Handle slash command interactions
 */
bot.on("interactionCreate", async (interaction) => {
    await handleInteraction(interaction, bot, Discord, logChannel);
});

/**
 * Graceful shutdown handling
 */
function gracefulShutdown(signal) {
    botLogger.info(`Received ${signal}, shutting down...`);
    
    // Clear intervals to prevent further operations
    if (embedInterval) {
        clearInterval(embedInterval);
        embedInterval = null;
    }
    if (mapCheckInterval) {
        clearInterval(mapCheckInterval);
        mapCheckInterval = null;
    }
    
    // Clear cleanup intervals for cache and rate limits
    clearCleanupIntervals();
    
    try {
        closeDB();
        botLogger.info("Shutdown complete.");
        process.exit(0);
    } catch (shutdownError) {
        error("Shutdown error:", shutdownError);
        process.exit(1);
    }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Global error handlers for unhandled promise rejections and exceptions
process.on("unhandledRejection", (error) => {
    error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
    error("Uncaught exception:", error);
    process.exit(1);
});

export { bot, logChannel };
