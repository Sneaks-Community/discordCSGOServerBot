/**
 * Notification service
 * Handles sending notifications to users when maps change
 */

import { EmbedBuilder } from "discord.js";
import pLimit from "p-limit";

import { CONFIG_VALUES, config } from "../config/index.js";
import { getUsersFollowingMap } from "../db/index.js";
import { mapNameSchema } from "../schemas/validationSchemas.js";
import { getTerminalReason, isRetryableDiscordError, TerminalError } from "../utils/discordErrors.js";
import { serviceLogger } from "../utils/logger.js";
import { getMapImage, normalizeMapName } from "../utils/mapUtils.js";
import { validateChannelForSend } from "../utils/permissions.js";
import { withRetry } from "../utils/retry.js";
import { validateWithZod } from "../utils/zodValidator.js";
import { checkRateLimit, getCachedUser } from "./cacheService.js";

// Store bot reference for fallback notifications
let botInstance = null;

// Per user per map per minute. Not configurable: above 1 just means sending the
// duplicate. The overall ceiling is RATE_LIMIT_NOTIFICATION_PER_MINUTE.
const NOTIFICATION_MAX_PER_MAP = 1;

// Concurrent DM sends per map change. Not configurable: discord.js's REST queue is
// the real throttle, so a larger number would only queue deeper, not send faster.
const NOTIFICATION_CONCURRENCY = 5;

/**
 * Initialize the notification service with bot instance
 * @param {Object} bot - The Discord bot client
 */
export function initNotificationService(bot) {
    botInstance = bot;
}

/**
 * Send notifications to users following a map
 * @param {string} map - The map name as reported by the game server
 * @param {Object} serverObj - The server object with player info
 * @param {Object} [bot] - The Discord bot client (defaults to the instance set via initNotificationService)
 */
export async function notifyUsers(map, serverObj, bot = botInstance) {
    const server = serverObj?.nick ?? "unknown server";
    const ip = serverObj?.ip ?? "unknown IP";

    // Strip any workshop path ("workshop/123456/surf_xyz" -> "surf_xyz") so lookups,
    // messages and image URLs all use the bare map name. Normally already done in
    // getInfo; repeated here because this is also reachable from /testnotify.
    const mapName = normalizeMapName(map);

    // Map names come from the game server, so they can still be values the follow
    // schema rejects. Nobody can be following such a map, since /follow validates
    // against the same schema, so treat it as "no followers" rather than throwing:
    // an escaping throw would stall map-change detection for this server entirely.
    const validatedMap = validateWithZod(mapNameSchema, mapName, "notifyUsers/map");
    if (!validatedMap.valid) {
        serviceLogger.debug({ map: mapName, reason: validatedMap.error, server }, "Skipping notifications for unfollowable map name");
        return;
    }

    const followers = await getUsersFollowingMap(validatedMap.data);

    // Bound the fanout per event, and say so when it bites: a map that suddenly has
    // hundreds of followers is worth seeing in the log rather than discovering later.
    const recipients = followers.slice(0, CONFIG_VALUES.MAX_NOTIFICATION_RECIPIENTS);
    if (recipients.length < followers.length) {
        serviceLogger.warn(
            {
                cap: CONFIG_VALUES.MAX_NOTIFICATION_RECIPIENTS,
                map: mapName,
                notified: recipients.length,
                server,
                skipped: followers.length - recipients.length
            },
            "Notification fanout truncated by MAX_NOTIFICATION_RECIPIENTS"
        );
    }

    // Loop-invariant, so built once per event rather than once per recipient. Uses the
    // validated lowercase name, matching the casing follows are stored under.
    const mapImage = getMapImage(validatedMap.data);

    const event = { bot, ip, mapImage, mapName, server, serverObj, validatedMapName: validatedMap.data };

    // Concurrency is about our own wall clock, not about protecting Discord: the REST
    // queue in discord.js already enforces the 50 requests/second global limit and
    // sleeps on a 429. Serially awaiting each DM could occupy this loop for minutes.
    const limit = pLimit(NOTIFICATION_CONCURRENCY);
    await Promise.all(recipients.map((user) => limit(() => deliverNotification(user, event))));
}

/**
 * Deliver one notification, falling back to the log channel when the DM fails.
 * Resolves rather than throwing on any per-recipient failure, so one bad recipient
 * cannot abandon the rest of the fanout.
 * @param {Object} user - Follow row with a discord_id
 * @param {Object} event - Loop-invariant event details shared by every recipient
 * @returns {Promise<void>}
 */
async function deliverNotification(user, event) {
    const { bot, ip, mapImage, mapName, server, serverObj, validatedMapName } = event;

    // Fetch user first to ensure we have a valid reference
    let u;
    try {
        u = await getCachedUser(user.discord_id, bot);
    } catch (fetchError) {
        serviceLogger.warn({ err: fetchError, userId: user.discord_id }, "Failed to fetch user");
        u = null;
    }

    try {
        if (!u) {
            // User fetch failed, send fallback notification to log channel
            await sendFallbackNotification(mapName, server, serverObj, ip, mapImage);
            return;
        }

        // Keyed per map, so a user following three maps that rotate together
        // hears about all three; only a repeat of the same map is suppressed.
        const perMap = checkRateLimit(user.discord_id, `notification:${validatedMapName}`, NOTIFICATION_MAX_PER_MAP);
        if (!perMap.allowed) {
            serviceLogger.debug(
                { map: mapName, server, userId: user.discord_id },
                "Skipping duplicate notification for the same map"
            );
            return;
        }

        // Checked second so a suppressed duplicate spends none of the ceiling.
        const perUser = checkRateLimit(user.discord_id, "notification", CONFIG_VALUES.NOTIFICATION_RATE_LIMIT_PER_MINUTE);
        if (!perUser.allowed) {
            serviceLogger.warn(
                {
                    limit: CONFIG_VALUES.NOTIFICATION_RATE_LIMIT_PER_MINUTE,
                    map: mapName,
                    retryAfter: perUser.retryAfter,
                    server,
                    userId: user.discord_id
                },
                "Notification dropped: user is at their per-minute notification limit"
            );
            return;
        }

        // Prepare the embed for the direct message
        const dmEmbed = new EmbedBuilder()
            .setTitle(`${mapName} is now on ${server}`)
            .setDescription(
                `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
            )
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
            .setTimestamp(Date.now());

        if (mapImage) dmEmbed.setImage(mapImage);

        // Send the direct message to the user with proper error handling
        await u.send({
            content: `${mapName} is now on ${server}!\nsteam://connect/${ip}`,
            embeds: [dmEmbed]
        });

        serviceLogger.info({ map: mapName, userId: u.id, username: u.tag }, "Sent notification");
    } catch (e) {
        // Handle failed DM (user may have DMs disabled or other issues). A refusal is
        // a property of the recipient, so it is never worth another attempt.
        const userId = u?.id || user.discord_id;
        const reason = getTerminalReason(e);
        if (reason) {
            serviceLogger.warn({ err: e, map: mapName, userId }, `DM refused by Discord, not retrying. ${reason}`);
        } else {
            serviceLogger.warn({ err: e, map: mapName, userId }, "Failed to send DM to user");
        }

        // Send fallback notification to log channel (without user mention)
        await sendFallbackNotification(mapName, server, serverObj, ip, mapImage);
    }
}

/**
 * Send fallback notification to the configured channel
 * @param {string} mapName - The normalized map name
 * @param {string} server - The server name
 * @param {Object} serverObj - The server object
 * @param {string} ip - The server IP
 * @param {string|false} mapImage - Map image URL
 */
async function sendFallbackNotification(mapName, server, serverObj, ip, mapImage) {
    // Nothing to fall back to, so there is nothing to retry. Without this an
    // unconfigured fallback costs three retried "guild not found" throws, with
    // backoff, for every recipient whose DM failed, which dominated the fanout.
    if (!config.fallback.guildID || !config.fallback.channelID) {
        serviceLogger.debug({ map: mapName }, "No fallback channel configured, skipping fallback notification");
        return;
    }

    const backupEmbed = new EmbedBuilder()
        .setTitle(`${mapName} is now on ${server}`)
        .setDescription(
            `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
        )
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
        .setTimestamp(Date.now());

    if (mapImage) backupEmbed.setImage(mapImage);

    const fallbackContent = `${mapName} is now on ${server}!\nsteam://connect/${ip}`;

    try {
        await withRetry(async () => {
            const guild = botInstance.guilds.cache.get(config.fallback.guildID);
            if (!guild) {
                throw new Error(`Fallback guild ${config.fallback.guildID} not found`);
            }
            const channel = guild.channels.cache.get(config.fallback.channelID);
            if (!channel) {
                throw new Error(`Fallback channel ${config.fallback.channelID} not found`);
            }
            // Validate permissions before sending. Terminal: another attempt cannot
            // grant the bot a permission it does not have.
            const permCheck = validateChannelForSend(channel);
            if (!permCheck.valid) {
                throw new TerminalError(
                    `Fallback channel permission error: ${permCheck.error}`,
                    `${permCheck.error} in the fallback channel ${config.fallback.channelID}; grant the bot those permissions there`
                );
            }
            await channel.send({
                content: fallbackContent,
                embeds: [backupEmbed]
            });
        }, { isRetryable: isRetryableDiscordError });
    } catch (fallbackError) {
        const reason = getTerminalReason(fallbackError);
        if (reason) {
            serviceLogger.error({ err: fallbackError, map: mapName }, `Fallback notification cannot succeed and will not be retried. ${reason}`);
        } else {
            serviceLogger.error({ err: fallbackError, map: mapName }, "Failed to send fallback notification");
        }
    }
}
