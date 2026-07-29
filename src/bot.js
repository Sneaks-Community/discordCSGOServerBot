/**
 * Discord bot client setup and event handlers
 * Main bot module that initializes and runs the Discord client
 */

import Discord, { Events, GatewayIntentBits } from "discord.js";

import { setFollowLogChannel } from "./commands/followCommands.js";
import { registerSlashCommands, handleInteraction } from "./commands/index.js";
import { config, CONFIG_VALUES, validateConfig } from "./config/index.js";
import { initDB, closeDB, unfollowAll } from "./db/index.js";
import { makeEmbed } from "./embeds/serverEmbeds.js";
import { startCleanupIntervals, clearCleanupIntervals } from "./services/cacheService.js";
import { notifyUsers, initNotificationService, setNotificationLogChannel } from "./services/notificationService.js";
import { refresh, getServerData, updateServerData } from "./services/serverService.js";
import { botLogger } from "./utils/logger.js";
import { validateChannelForEdit, validateChannelForSend } from "./utils/permissions.js";
import { withRetry } from "./utils/retry.js";

// Store interval references for cleanup during shutdown
let embedInterval = null;
let mapCheckInterval = null;

// Create bot client with v14 intents
const bot = new Discord.Client({
    intents: [
        GatewayIntentBits.Guilds,
        // Privileged: required for guildMemberRemove (follow cleanup). Must also be
        // enabled as "Server Members Intent" in the Discord Developer Portal, or
        // login fails with "Used disallowed intents".
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ]
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

    // Log in with the configured token explicitly. ClientOptions has no `token`
    // field: discord.js ignores it and otherwise falls back to process.env.DISCORD_TOKEN,
    // so passing it here is what actually keeps login working if the variable is ever
    // renamed. Pino's redact paths only scrub matching keys on logged objects, so
    // never interpolate the token into a log message.
    bot.login(config.discord.token).catch(err => {
        botLogger.fatal({ err }, "Failed to login to Discord");
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
                    botLogger.warn(
                        { channelId: config.logging?.channelID, reason: permCheck.error },
                        "Log channel permission check failed; disabling channel logging"
                    );
                    logChannel = null; // Disable logging if permissions are missing
                }
            } else {
                botLogger.warn(
                    { channelId: config.logging?.channelID, guildId: config.logging?.guildID },
                    "Log channel not found in guild"
                );
            }
        } else {
            botLogger.warn({ guildId: config.logging?.guildID }, "Logging guild not found");
        }

        // Set log channel for follow commands and notifications
        setFollowLogChannel(logChannel);
        setNotificationLogChannel(logChannel);

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
        botLogger.fatal({ err }, "Failed during ready initialization");
        process.exit(1);
    }
});

/**
 * Interval function to refresh server data and update embeds
 */
async function intervalFunction() {
    try {
        await refresh();
    } catch (err) {
        botLogger.error({ err }, "Failed to refresh server data");
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
            } catch (err) {
                botLogger.error({ channelId: e.channelID, err }, "Failed to update embed after retries");
            }
        })
    );
}

/**
 * Handle guild member remove event - clean up follows when member leaves.
 * Scoped to the primary guild so that leaving some other shared guild does not
 * wipe follows; if DISCORD_GUILD_ID is unset, any guild triggers cleanup.
 */
bot.on("guildMemberRemove", (member) => {
    const primaryGuildID = config.discord?.guildID;
    if (primaryGuildID && member.guild?.id !== primaryGuildID) {
        return;
    }

    try {
        unfollowAll(member.id);
        botLogger.info({ guildId: member.guild?.id, userId: member.id }, "Removed follows for departed member");
    } catch (err) {
        botLogger.error({ err, guildId: member.guild?.id, userId: member.id }, "Failed to remove follows for departed member");
    }
});

/**
 * Handle slash command interactions
 */
bot.on("interactionCreate", async (interaction) => {
    await handleInteraction(interaction, bot, logChannel);
});

/**
 * Gateway lifecycle logging.
 *
 * These are observability only: the intervals keep running through a reconnect on
 * purpose. Server queries go to the game servers rather than Discord, and embed
 * edits are REST calls that do not depend on the gateway, are queued by discord.js,
 * and are already wrapped in withRetry plus a try/catch.
 */
bot.on(Events.ShardDisconnect, (event, shardId) => {
    // Only emitted for unrecoverable close codes; the shard will not come back.
    botLogger.error({ code: event.code, shardId }, "Shard disconnected and will not reconnect");
});

bot.on(Events.ShardReconnecting, (shardId) => {
    botLogger.warn({ shardId }, "Shard reconnecting to Discord");
});

bot.on(Events.ShardResume, (shardId, replayedEvents) => {
    botLogger.info({ replayedEvents, shardId }, "Shard resumed its session");
});

bot.on(Events.ShardReady, (shardId) => {
    botLogger.info({ shardId }, "Shard ready");
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
        botLogger.fatal({ err: shutdownError }, "Shutdown error");
        process.exit(1);
    }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Global error handlers for unhandled promise rejections and exceptions.
// `reason` is not guaranteed to be an Error; Pino's err serializer passes
// non-Error values through unchanged.
process.on("unhandledRejection", (reason) => {
    botLogger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
    botLogger.fatal({ err }, "Uncaught exception");
    process.exit(1);
});
