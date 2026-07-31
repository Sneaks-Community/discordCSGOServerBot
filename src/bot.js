/**
 * Discord bot client setup and event handlers
 * Main bot module that initializes and runs the Discord client
 */

import Discord, { Events, GatewayIntentBits } from "discord.js";

import { registerSlashCommands, handleInteraction } from "./commands/index.js";
import { config, CONFIG_VALUES, validateConfig } from "./config/index.js";
import { initDB, closeDB, unfollowAll } from "./db/index.js";
import { makeEmbed } from "./embeds/serverEmbeds.js";
import { startCleanupIntervals, clearCleanupIntervals } from "./services/cacheService.js";
import { notifyUsers, initNotificationService } from "./services/notificationService.js";
import { refresh, getServerData, updateServerData } from "./services/serverService.js";
import { getTerminalReason, isRetryableDiscordError, TerminalError } from "./utils/discordErrors.js";
import { botLogger } from "./utils/logger.js";
import { validateChannelForEdit } from "./utils/permissions.js";
import { withRetry } from "./utils/retry.js";

// Store interval references for cleanup during shutdown
let embedInterval = null;

/**
 * The configured presence, in the shape ClientOptions takes.
 *
 * Sent with the IDENTIFY payload rather than set from the ready handler: that is
 * one fewer gateway op, it leaves no window where the bot is online with no
 * status, and it is re-sent automatically on every reconnect. discord.js turns a
 * Custom activity's `name` into its `state` itself, so one field covers all types.
 * @returns {import('discord.js').PresenceData} - Presence, with no activity when the text is empty
 */
function buildPresence() {
    const { text, type } = config.activity;

    return { activities: text ? [{ name: text, type }] : [] };
}

// Create bot client with v14 intents
const bot = new Discord.Client({
    intents: [
        // Populates guilds/channels/roles caches, which the fallback notification
        // lookup and every permission check read, and makes interaction.guild resolve.
        GatewayIntentBits.Guilds,
        // Privileged: required for guildMemberRemove (follow cleanup). Must also be
        // enabled as "Server Members Intent" in the Discord Developer Portal, or
        // login fails with "Used disallowed intents".
        GatewayIntentBits.GuildMembers
    ],
    presence: buildPresence()
});

/**
 * Initialize the bot and start all services.
 *
 * Rejects rather than exiting on any startup failure, including an invalid
 * configuration and a failed login, so index.js is the only place that decides
 * to end the process.
 * @throws {ConfigError} If the configuration is unusable
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
    //
    // Awaited: unawaited, initBot() resolved before login finished and a rejection
    // (an invalid token, or disallowed intents) could never reach index.js.
    await bot.login(config.discord.token);
}

/**
 * Bot ready event handler
 */
bot.on(Events.ClientReady, async () => {
    try {
        botLogger.info("Started as " + bot.user.tag);

        // Register slash commands
        await registerSlashCommands(bot);

        // Start the interval function
        await intervalFunction();

        // Single loop: refresh, embeds, then map-change notifications (store reference for cleanup)
        embedInterval = setInterval(intervalFunction, CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS);

        // Start cleanup intervals for cache and rate limits
        startCleanupIntervals();
    } catch (err) {
        botLogger.fatal({ err }, "Failed during ready initialization");
        process.exit(1);
    }
});

/**
 * Interval function: refresh server data, update embeds, then notify on map changes.
 * Map detection lives here rather than on its own timer so it always reads the
 * snapshot refresh() just wrote; two timers only drifted apart and could overlap.
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

                    // Validate permissions before editing. Terminal: a missing
                    // permission needs an operator, not another attempt.
                    const permCheck = validateChannelForEdit(channel);
                    if (!permCheck.valid) {
                        throw new TerminalError(
                            `Permission check failed for channel ${e.channelID}: ${permCheck.error}`,
                            `${permCheck.error} in channel ${e.channelID}; grant the bot those permissions there`
                        );
                    }

                    const message = await channel.messages.fetch(e.messageID);
                    // Mentions denied: the embed is built from server names and map
                    // names supplied by the game servers, and an edit re-resolves
                    // mentions in the payload.
                    await message.edit({ allowedMentions: { parse: [] }, content: "\u200B", embeds: [embed] });
                }, { isRetryable: isRetryableDiscordError });
            } catch (err) {
                const reason = getTerminalReason(err);
                if (reason) {
                    botLogger.error({ channelId: e.channelID, err, messageId: e.messageID }, `Embed update cannot succeed and will not be retried. ${reason}`);
                } else {
                    botLogger.error({ channelId: e.channelID, err }, "Failed to update embed after retries");
                }
            }
        })
    );

    // Last, because DM fanout can outlast the embed edits and should not delay them.
    try {
        await updateServerData(notifyUsers);
    } catch (err) {
        botLogger.error({ err }, "Failed to check for map changes");
    }
}

/**
 * Handle guild member remove event - clean up follows when member leaves.
 * Scoped to the primary guild so that leaving some other shared guild does not
 * wipe follows; if DISCORD_GUILD_ID is unset, any guild triggers cleanup.
 */
bot.on("guildMemberRemove", (member) => {
    const primaryGuildID = config.discord.guildID;
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
    await handleInteraction(interaction);
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
 * Longest the shutdown may take before the process exits regardless. Docker's
 * default grace period is 10s, so this stays well inside it.
 */
const SHUTDOWN_TIMEOUT_MS = 5000;

// Set once shutdown starts, so a second signal cannot re-enter and double-close.
let isShuttingDown = false;

/**
 * Graceful shutdown handling
 * @param {string} signal - The signal that triggered the shutdown
 */
async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        botLogger.debug(`Ignoring ${signal}, shutdown already in progress`);
        return;
    }
    isShuttingDown = true;

    botLogger.info(`Received ${signal}, shutting down...`);

    // Hard exit so a hung destroy cannot wedge the container until Docker escalates
    // to SIGKILL. Deliberately not unref'd: an unref'd timer lets Node exit 0 the
    // moment the loop empties, which reports a stalled shutdown as a clean one.
    const hardExit = setTimeout(() => {
        botLogger.error(`Shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS}ms, exiting anyway`);
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    // Clear intervals to prevent further operations
    if (embedInterval) {
        clearInterval(embedInterval);
        embedInterval = null;
    }

    // Clear cleanup intervals for cache and rate limits
    clearCleanupIntervals();

    let exitCode = 0;

    // Close the gateway instead of letting the process drop it, so discord.js stops
    // its own sweepers and in-flight REST calls are not abandoned mid-request.
    try {
        await bot.destroy();
    } catch (destroyError) {
        botLogger.error({ err: destroyError }, "Failed to close the Discord connection");
        exitCode = 1;
    }

    // Separate try: the database must be closed even if destroy failed, or SQLite
    // skips its WAL checkpoint.
    try {
        closeDB();
    } catch (dbError) {
        botLogger.fatal({ err: dbError }, "Failed to close the database");
        exitCode = 1;
    }

    clearTimeout(hardExit);

    if (exitCode === 0) {
        botLogger.info("Shutdown complete.");
    } else {
        botLogger.warn("Shutdown complete, with errors.");
    }

    process.exit(exitCode);
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

    // Best effort on the way out: the process is going down regardless, but leaving
    // the connection open skips SQLite's WAL checkpoint.
    try {
        closeDB();
    } catch (dbError) {
        botLogger.error({ err: dbError }, "Failed to close the database during crash exit");
    }

    process.exit(1);
});
