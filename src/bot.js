import Discord, { Events, GatewayIntentBits, Options } from "discord.js";

import { registerSlashCommands, handleInteraction } from "./commands/index.js";
import { config, CONFIG_VALUES, validateConfig } from "./config/index.js";
import { initDB, closeDB, unfollowAll } from "./db/index.js";
import { makeEmbed } from "./embeds/serverEmbeds.js";
import { startCleanupIntervals, clearCleanupIntervals } from "./services/cacheService.js";
import { recordTick, startHealthServer, stopHealthServer } from "./services/healthService.js";
import { notifyUsers, initNotificationService } from "./services/notificationService.js";
import { refresh, getServerData, updateServerData } from "./services/serverService.js";
import { getTerminalReason, isRetryableDiscordError, TerminalError } from "./utils/discordErrors.js";
import { botLogger, flushLogs } from "./utils/logger.js";
import { validateChannelForEdit } from "./utils/permissions.js";
import { withRetry } from "./utils/retry.js";

let embedInterval = null;

/**
 * The configured presence, in the shape ClientOptions takes. Sent with IDENTIFY
 * rather than from the ready handler, so there is no window where the bot is
 * online with no status and it is re-sent on every reconnect. discord.js maps a
 * Custom activity's `name` to its `state`, so one field covers every type.
 * @returns {import('discord.js').PresenceData}
 */
function buildPresence() {
    const { text, type } = config.activity;

    return { activities: text ? [{ name: text, type }] : [] };
}

// Cache growth here is measured in weeks of uptime, so hourly is ample.
const CACHE_SWEEP_INTERVAL_SECONDS = 3600;

const MESSAGE_CACHE_LIFETIME_SECONDS = 7200;

/**
 * Matches every cache entry but the bot's own. A GuildMember's id is its user's
 * id, so this reads the same for the user and member caches.
 * @param {{ id: string }} entry - A cached user or member
 * @returns {boolean} - Whether the entry may be swept
 */
function isNotClient(entry) {
    return entry.id !== bot.user?.id;
}

// discord.js calls a sweeper's filter once per sweep, then uses what it returns.
const sweepAllButClient = () => isNotClient;

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
    presence: buildPresence(),
    // By default discord.js sweeps only threads and leaves the user and member
    // caches unbounded. Everything swept here is re-fetched on demand, and
    // bot.destroy() clears the intervals.
    sweepers: {
        ...Options.DefaultSweeperSettings,
        // Keep the bot's own member: guild.members.me returns null if swept
        // rather than re-fetching, and validateChannelForEdit reads that null as
        // a missing permission and gives up on the channel for good.
        guildMembers: { filter: sweepAllButClient, interval: CACHE_SWEEP_INTERVAL_SECONDS },
        // Only the embed messages are fetched, and they are re-fetched every tick.
        messages: { interval: CACHE_SWEEP_INTERVAL_SECONDS, lifetime: MESSAGE_CACHE_LIFETIME_SECONDS },
        // getCachedUser keeps its own TTL cache in front of bot.users, so this
        // copy is not authoritative.
        users: { filter: sweepAllButClient, interval: CACHE_SWEEP_INTERVAL_SECONDS }
    }
});

/**
 * Rejects rather than exiting on any startup failure, so index.js is the only
 * place that decides to end the process.
 * @throws {ConfigError} If the configuration is unusable
 */
export async function initBot() {
    validateConfig();
    initDB();
    initNotificationService(bot);

    // Passed explicitly: ClientOptions has no `token` field, so discord.js would
    // otherwise fall back to process.env.DISCORD_TOKEN. Pino only redacts keys on
    // logged objects, so never interpolate the token into a message.
    //
    // Awaited, or an invalid token or disallowed intents could never reach
    // index.js: initBot() would resolve before login finished.
    await bot.login(config.discord.token);
}

bot.on(Events.ClientReady, async () => {
    try {
        botLogger.info("Started as " + bot.user.tag);

        // First: guilds joined while the bot was offline emit no guildCreate, so
        // this is the only place they are caught.
        await enforceSingleGuild();

        // Before the first tick, so a wedge in the steps below still answers.
        startHealthServer(bot);

        // Non-fatal: the commands Discord already holds stay usable, so a 5xx on
        // this one PUT must not crash-loop the bot under the restart policy.
        try {
            await registerSlashCommands(bot);
        } catch (err) {
            botLogger.error({ err }, "Failed to register slash commands; continuing with the set Discord already has");
        }

        await intervalFunction();
        embedInterval = setInterval(intervalFunction, CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS);
        startCleanupIntervals();
    } catch (err) {
        botLogger.fatal({ err }, "Failed during ready initialization");
        await flushLogs();
        process.exit(1);
    }
});

/**
 * The single loop: refresh, update embeds, then notify on map changes. Detection
 * shares this timer so it always reads the snapshot refresh() just wrote.
 */
async function intervalFunction() {
    recordTick();

    try {
        await refresh();
    } catch (err) {
        botLogger.error({ err }, "Failed to refresh server data");
        return; // Skip embed update if refresh fails
    }
    
    const serverData = getServerData();
    const embed = makeEmbed(serverData);

    await Promise.all(
        config.embeds.map(async (e) => {
            try {
                await withRetry(async () => {
                    const channel = await bot.channels.fetch(e.channelID);

                    // Terminal: a missing permission needs an operator, not
                    // another attempt.
                    const permCheck = validateChannelForEdit(channel);
                    if (!permCheck.valid) {
                        throw new TerminalError(
                            `Permission check failed for channel ${e.channelID}: ${permCheck.error}`,
                            `${permCheck.error} in channel ${e.channelID}; grant the bot those permissions there`
                        );
                    }

                    const message = await channel.messages.fetch(e.messageID);
                    // Mentions denied: the embed carries server and map names from
                    // the game servers, and an edit re-resolves mentions.
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

/** @param {import('discord.js').Guild} guild */
async function leaveOtherGuild(guild) {
    botLogger.warn({ guildId: guild.id, guildName: guild.name }, "Leaving a guild this instance does not serve");

    try {
        await guild.leave();
    } catch (err) {
        botLogger.error({ err, guildId: guild.id }, "Failed to leave that guild");
    }
}

/**
 * Leaves every guild but DISCORD_GUILD_ID, so one instance serves one guild.
 * Missing from the configured guild is fatal, not another guild to leave: the
 * other way round, a typo in the ID would evict the bot from its real guild.
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
 * discord.js emits this only for genuinely new guilds while the shard is ready,
 * so a guild returning after an outage (guildAvailable) cannot trip it.
 */
bot.on(Events.GuildCreate, (guild) => {
    if (guild.id === config.discord.guildID) {
        return;
    }

    void leaveOtherGuild(guild);
});

/**
 * Cleans up a departed member's follows. Scoped to the served guild: an event
 * from anywhere else must not wipe follows made in this one.
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

bot.on(Events.InteractionCreate, async (interaction) => {
    await handleInteraction(interaction);
});

/**
 * Gateway lifecycle. The intervals keep running through a reconnect on purpose:
 * server queries do not touch Discord, and embed edits are REST calls that
 * discord.js queues and withRetry already covers.
 */
bot.on(Events.ShardDisconnect, (event, shardId) => {
    // Only emitted for unrecoverable close codes, so the shard will not return.
    // Staying up would fail every edit and DM while the container's restart
    // policy never fires, because nothing exited.
    botLogger.fatal({ code: event.code, shardId }, "Shard disconnected and will not reconnect");
    void gracefulShutdown(`shardDisconnect(${event.code})`, 1);
});

bot.on(Events.ShardError, (error, shardId) => {
    botLogger.error({ err: error, shardId }, "Shard websocket error");
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

// Inside Docker's 10s default grace period, so the process exits on its own terms.
const SHUTDOWN_TIMEOUT_MS = 5000;

// Set once shutdown starts, so a second signal cannot re-enter and double-close.
let isShuttingDown = false;

/**
 * @param {string} signal - What triggered the shutdown, for the log line
 * @param {number} [initialExitCode] - Non-zero when the shutdown was itself
 *   caused by a failure, so a restart loop does not look like a clean stop
 * @returns {Promise<void>}
 */
async function gracefulShutdown(signal, initialExitCode = 0) {
    if (isShuttingDown) {
        botLogger.debug(`Ignoring ${signal}, shutdown already in progress`);
        return;
    }
    isShuttingDown = true;

    botLogger.info(`Received ${signal}, shutting down...`);

    // Hard exit so a hung destroy cannot wedge the container until Docker sends
    // SIGKILL. Not unref'd: that would let Node exit 0 as soon as the loop
    // empties, reporting a stalled shutdown as a clean one.
    const hardExit = setTimeout(async () => {
        botLogger.error(`Shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS}ms, exiting anyway`);
        await flushLogs();
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    if (embedInterval) {
        clearInterval(embedInterval);
        embedInterval = null;
    }

    clearCleanupIntervals();

    // Before destroy(): the listener must not outlive the shutdown.
    stopHealthServer();

    let exitCode = initialExitCode;

    // Closed rather than dropped, so discord.js stops its own sweepers and
    // in-flight REST calls are not abandoned mid-request.
    try {
        await bot.destroy();
    } catch (destroyError) {
        botLogger.error({ err: destroyError }, "Failed to close the Discord connection");
        exitCode = 1;
    }

    // Separate try: the database must close even if destroy failed, or SQLite
    // skips its WAL checkpoint.
    try {
        closeDB();
    } catch (dbError) {
        botLogger.fatal({ err: dbError }, "Failed to close the database");
        exitCode = 1;
    }

    if (exitCode === 0) {
        botLogger.info("Shutdown complete.");
    } else {
        botLogger.warn("Shutdown complete, with errors.");
    }

    // Before the exit and while hardExit is still armed, so a shutdown cannot
    // end up saying nothing either way.
    await flushLogs();

    clearTimeout(hardExit);
    process.exit(exitCode);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// `reason` is not guaranteed to be an Error; pino's err serializer passes
// non-Error values through unchanged.
process.on("unhandledRejection", (reason) => {
    botLogger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", async (err) => {
    botLogger.fatal({ err }, "Uncaught exception");

    // Best effort: the process is going down regardless, but leaving the
    // connection open skips SQLite's WAL checkpoint.
    try {
        closeDB();
    } catch (dbError) {
        botLogger.error({ err: dbError }, "Failed to close the database during crash exit");
    }

    // Registering this handler is what stops Node exiting on its own, so the loop is
    // still turning and the flush can be awaited. It is capped, so an already-broken
    // process cannot linger here.
    await flushLogs();

    process.exit(1);
});
