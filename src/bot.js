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

        // Before serving anything: guilds joined while the bot was offline emit no
        // guildCreate, so this is the only place they are caught.
        await enforceSingleGuild();

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
 * Leave a guild this instance does not serve.
 * @param {Object} guild - The guild to leave
 */
async function leaveOtherGuild(guild) {
    botLogger.warn({ guildId: guild.id, guildName: guild.name }, "Leaving a guild this instance does not serve");

    try {
        await guild.leave();
    } catch (err) {
        botLogger.error({ err, guildId: guild.id }, "Failed to leave that guild");
    }
}

/**
 * Leave every guild but DISCORD_GUILD_ID, so one instance serves one guild.
 * Not being in the configured guild is fatal rather than another thing to fix by
 * leaving: read that way round, a typo in the ID would evict the bot from the guild
 * it actually belongs to.
 * @throws {Error} If the bot is not in the configured guild
 */
async function enforceSingleGuild() {
    const primaryGuildID = config.discord.guildID;

    if (!bot.guilds.cache.has(primaryGuildID)) {
        throw new Error(`The bot is not in DISCORD_GUILD_ID ${primaryGuildID}; check the ID and that the bot has been invited to that guild`);
    }

    await Promise.all(bot.guilds.cache.filter((guild) => guild.id !== primaryGuildID).map(leaveOtherGuild));
}

/**
 * Decline an invite to any other guild by leaving it again.
 * discord.js emits this only for genuinely new guilds while the shard is ready, so
 * a guild coming back after an outage (guildAvailable) cannot trip it.
 */
bot.on(Events.GuildCreate, (guild) => {
    if (guild.id === config.discord.guildID) {
        return;
    }

    void leaveOtherGuild(guild);
});

/**
 * Handle guild member remove event - clean up follows when member leaves.
 * Scoped to the served guild: the bot is only ever in one, but an event from
 * anywhere else must not wipe follows made in this one.
 */
bot.on(Events.GuildMemberRemove, (member) => {
    if (member.guild?.id !== config.discord.guildID) {
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
bot.on(Events.InteractionCreate, async (interaction) => {
    await handleInteraction(interaction);
});

/**
 * Gateway lifecycle handling.
 *
 * Reconnects are observability only: the intervals keep running through one on
 * purpose. Server queries go to the game servers rather than Discord, and embed
 * edits are REST calls that do not depend on the gateway, are queued by discord.js,
 * and are already wrapped in withRetry plus a try/catch.
 */
bot.on(Events.ShardDisconnect, (event, shardId) => {
    // Only emitted for unrecoverable close codes, so the shard will not come back:
    // staying up means every embed edit and DM fails and no interaction ever arrives,
    // while the container's restart policy never fires because nothing exited.
    botLogger.fatal({ code: event.code, shardId }, "Shard disconnected and will not reconnect");
    void gracefulShutdown(`shardDisconnect(${event.code})`, 1);
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
 * @param {number} [initialExitCode] - Exit code for a shutdown that was itself caused by a
 *   failure, so a supervisor restart loop is visible as one rather than as a clean stop
 * @returns {Promise<void>} Resolves only if the process somehow survives the exit
 */
async function gracefulShutdown(signal, initialExitCode = 0) {
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

    let exitCode = initialExitCode;

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
