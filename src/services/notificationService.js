/**
 * Notification service
 * Handles sending notifications to users when maps change
 */

import pLimit from "p-limit";

import { CONFIG_VALUES, config } from "../config/index.js";
import { getUsersFollowingMap } from "../db/index.js";
import { createBaseEmbed } from "../embeds/baseEmbed.js";
import { mapNameSchema } from "../schemas/validationSchemas.js";
import { getTerminalReason, isRecipientRefusal, isRetryableDiscordError, TerminalError } from "../utils/discordErrors.js";
import { serviceLogger } from "../utils/logger.js";
import { getMapImage, normalizeMapName } from "../utils/mapUtils.js";
import { validateChannelForSend } from "../utils/permissions.js";
import { withRetry } from "../utils/retry.js";
import { validateWithZod } from "../utils/zodValidator.js";
import { checkRateLimit, getCachedUser, isDmRefused, markDmRefused } from "./cacheService.js";

// Store bot reference for fallback notifications
let botInstance = null;

// Per user per map per minute. Not configurable: above 1 just means sending the
// duplicate. The overall ceiling is RATE_LIMIT_NOTIFICATION_PER_MINUTE.
const NOTIFICATION_MAX_PER_MAP = 1;

// Concurrent DM sends per map change. Not configurable: discord.js's REST queue is
// the real throttle, so a larger number would only queue deeper, not send faster.
const NOTIFICATION_CONCURRENCY = 5;

/**
 * What became of one recipient's DM. Only the last two are undeliverable and
 * reach the fallback channel; a suppressed duplicate is a deliberate drop.
 * @type {Readonly<Object<string, string>>}
 */
const DELIVERY = Object.freeze({
    delivered: "delivered",
    failed: "failed",
    refused: "refused",
    suppressed: "suppressed"
});

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

    // gamedig's connect address when the caller has one: the configured ip may omit
    // the port, and steam://connect needs the port the game actually listens on.
    const ip = serverObj?.fullIP ?? serverObj?.ip ?? "unknown IP";

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

    const followers = getUsersFollowingMap(validatedMap.data);

    // Drop recipients still inside a refusal cooldown before the cap is applied, so
    // the fanout budget is spent on people who can actually receive a DM.
    const deliverable = followers.filter((follower) => !isDmRefused(follower.discord_id));
    const inCooldown = followers.length - deliverable.length;

    // Bound the fanout per event, and say so when it bites: a map that suddenly has
    // hundreds of followers is worth seeing in the log rather than discovering later.
    const recipients = deliverable.slice(0, CONFIG_VALUES.MAX_NOTIFICATION_RECIPIENTS);
    if (recipients.length < deliverable.length) {
        serviceLogger.warn(
            {
                cap: CONFIG_VALUES.MAX_NOTIFICATION_RECIPIENTS,
                map: mapName,
                notified: recipients.length,
                server,
                skipped: deliverable.length - recipients.length
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
    const outcomes = await Promise.all(recipients.map((user) => limit(() => deliverNotification(user, event))));

    // One fallback message per map change, not one per failing recipient: ten
    // followers with closed DMs used to post ten identical messages to the channel.
    const undeliverable = tallyUndeliverable(outcomes, inCooldown);
    if (undeliverable.total > 0) {
        await sendFallbackNotification(event, undeliverable);
    }
}

/**
 * Count the recipients this map change could not reach.
 * @param {string[]} outcomes - One DELIVERY value per attempted recipient
 * @param {number} inCooldown - Recipients skipped before the attempt, still in cooldown
 * @returns {{failed: number, inCooldown: number, refused: number, total: number}} - Undeliverable tally
 */
function tallyUndeliverable(outcomes, inCooldown) {
    const failed = outcomes.filter((outcome) => outcome === DELIVERY.failed).length;
    const refused = outcomes.filter((outcome) => outcome === DELIVERY.refused).length;

    return { failed, inCooldown, refused, total: failed + refused + inCooldown };
}

/**
 * Describe the undeliverable tally in one line, so the channel message says who
 * missed out rather than only repeating the announcement.
 * @param {{failed: number, inCooldown: number, refused: number, total: number}} undeliverable - Tally from tallyUndeliverable
 * @returns {string} - A sentence naming the counts
 */
function describeUndeliverable({ failed, inCooldown, refused, total }) {
    const parts = [];
    if (refused > 0) parts.push(`${refused} refused the DM`);
    if (inCooldown > 0) parts.push(`${inCooldown} skipped after an earlier refusal`);
    if (failed > 0) parts.push(`${failed} failed`);

    return `_${total} follower${total === 1 ? "" : "s"} could not be DMed: ${parts.join(", ")}._`;
}

/**
 * Build the embed announcing a map change. The DM and the fallback message show the
 * same thing, so both call this.
 * @param {Object} event - Loop-invariant event details shared by every recipient
 * @returns {EmbedBuilder} - The embed to send
 */
function buildMapNotificationEmbed({ mapImage, mapName, server, serverObj }) {
    const embed = createBaseEmbed(`${mapName} is now on ${server}`)
        .setDescription(
            `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
        );

    if (mapImage) embed.setImage(mapImage);

    return embed;
}

/**
 * Build the message content announcing a map change, carrying the connect link that
 * an embed cannot make clickable.
 * @param {Object} event - Loop-invariant event details shared by every recipient
 * @returns {string} - The message content
 */
function buildNotificationContent({ ip, mapName, server }) {
    return `${mapName} is now on ${server}!\nsteam://connect/${ip}`;
}

/**
 * Deliver one notification. Reports its outcome rather than throwing, so one bad
 * recipient cannot abandon the rest of the fanout, and notifyUsers can send a
 * single fallback message covering everyone it could not reach.
 * @param {Object} user - Follow row with a discord_id
 * @param {Object} event - Loop-invariant event details shared by every recipient
 * @returns {Promise<string>} - One of the DELIVERY values
 */
async function deliverNotification(user, event) {
    const { bot, mapName, server, validatedMapName } = event;

    // Fetch user first to ensure we have a valid reference
    let u;
    try {
        u = await getCachedUser(user.discord_id, bot);
    } catch (fetchError) {
        serviceLogger.warn({ err: fetchError, userId: user.discord_id }, "Failed to fetch user");
        return DELIVERY.failed;
    }

    try {
        // Keyed per map, so a user following three maps that rotate together
        // hears about all three; only a repeat of the same map is suppressed.
        const perMap = checkRateLimit(user.discord_id, `notification:${validatedMapName}`, NOTIFICATION_MAX_PER_MAP);
        if (!perMap.allowed) {
            serviceLogger.debug(
                { map: mapName, server, userId: user.discord_id },
                "Skipping duplicate notification for the same map"
            );
            return DELIVERY.suppressed;
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
            return DELIVERY.suppressed;
        }

        // Send the direct message to the user with proper error handling.
        // allowedMentions denies every mention type: the map name and server nick
        // come from the game server, and escapeForDiscord neutralizes markdown but
        // not "@", so nothing here should ever be able to ping.
        await u.send({
            allowedMentions: { parse: [] },
            content: buildNotificationContent(event),
            embeds: [buildMapNotificationEmbed(event)]
        });

        serviceLogger.info({ map: mapName, userId: u.id, username: u.tag }, "Sent notification");
        return DELIVERY.delivered;
    } catch (e) {
        // Handle failed DM (user may have DMs disabled or other issues). A refusal is
        // a property of the recipient, so it is never worth another attempt.
        const userId = u?.id || user.discord_id;
        const reason = getTerminalReason(e);

        if (isRecipientRefusal(e)) {
            // Remembered, so the next map change skips them instead of spending
            // another refused call on a state only the recipient can change.
            markDmRefused(userId);
            serviceLogger.warn({ err: e, map: mapName, userId }, `DM refused by Discord, skipping this recipient until the cooldown expires. ${reason}`);
            return DELIVERY.refused;
        }

        if (reason) {
            serviceLogger.warn({ err: e, map: mapName, userId }, `DM cannot be delivered, not retrying. ${reason}`);
        } else {
            serviceLogger.warn({ err: e, map: mapName, userId }, "Failed to send DM to user");
        }

        return DELIVERY.failed;
    }
}

/**
 * Resolve the configured fallback channel, fetching it when the cache misses.
 *
 * The cache is only populated for channels the gateway has told us about, so a
 * cache-only lookup fails permanently after a restart until something happens in
 * that channel. fetch() fills the cache and raises Unknown Channel (10003) for a
 * wrong ID, which isRetryableDiscordError already classifies as terminal.
 * @param {Object} bot - The Discord client to resolve through
 * @returns {Promise<Object>} - The resolved channel
 * @throws {TerminalError} If the channel does not resolve, or is in another guild
 */
async function resolveFallbackChannel(bot) {
    const { channelID } = config.fallback;
    const guildID = config.discord.guildID;

    const channel = bot.channels.cache.get(channelID) ?? (await bot.channels.fetch(channelID));
    if (!channel) {
        throw new TerminalError(
            `Fallback channel ${channelID} not found`,
            `FALLBACK_CHANNEL_ID ${channelID} does not resolve to a channel the bot can see; check the ID and that the channel is in guild ${guildID}`
        );
    }

    // The bot serves one guild, so the channel has to be in it. Still checked rather
    // than assumed: fetch() also resolves DM channels, and an ID left over from a
    // guild the bot has since left would otherwise fail further in.
    const channelGuildID = channel.guildId ?? channel.guild?.id;
    if (channelGuildID !== guildID) {
        throw new TerminalError(
            `Fallback channel ${channelID} is in guild ${channelGuildID}, not the served guild ${guildID}`,
            `FALLBACK_CHANNEL_ID ${channelID} is not a channel in guild ${guildID}; point it at one there`
        );
    }

    return channel;
}

/**
 * Send the one fallback message for a map change, covering every recipient it
 * could not reach.
 * @param {Object} event - The same event details deliverNotification received
 * @param {{failed: number, inCooldown: number, refused: number, total: number}} undeliverable - Tally from tallyUndeliverable
 */
async function sendFallbackNotification(event, undeliverable) {
    // Uses the client threaded through from notifyUsers rather than the module-level
    // botInstance, so an explicitly passed client is honoured.
    const { bot, mapName } = event;

    // Nothing to fall back to, so there is nothing to retry. Without this an
    // unconfigured fallback costs three retried "channel not found" throws, with
    // backoff, for every recipient whose DM failed, which dominated the fanout.
    if (!config.fallback.channelID) {
        serviceLogger.debug({ map: mapName, undeliverable: undeliverable.total }, "No fallback channel configured, skipping fallback notification");
        return;
    }

    // Only reachable if initNotificationService was never called and no client was
    // passed; without this the retries would be three TypeErrors deep in withRetry.
    if (!bot) {
        serviceLogger.error({ map: mapName }, "No Discord client available, skipping fallback notification");
        return;
    }

    try {
        await withRetry(async () => {
            const channel = await resolveFallbackChannel(bot);
            // Validate permissions before sending. Terminal: another attempt cannot
            // grant the bot a permission it does not have.
            const permCheck = validateChannelForSend(channel);
            if (!permCheck.valid) {
                throw new TerminalError(
                    `Fallback channel permission error: ${permCheck.error}`,
                    `${permCheck.error} in the fallback channel ${config.fallback.channelID}; grant the bot those permissions there`
                );
            }
            // Same reasoning as the DM, and it matters more here: this goes to a
            // channel, so an @everyone slipping through would reach the whole guild.
            await channel.send({
                allowedMentions: { parse: [] },
                content: `${buildNotificationContent(event)}\n${describeUndeliverable(undeliverable)}`,
                embeds: [buildMapNotificationEmbed(event)]
            });
        }, { isRetryable: isRetryableDiscordError });

        serviceLogger.info({ map: mapName, ...undeliverable }, "Sent one fallback notification for the undeliverable recipients");
    } catch (fallbackError) {
        const reason = getTerminalReason(fallbackError);
        if (reason) {
            serviceLogger.error({ err: fallbackError, map: mapName }, `Fallback notification cannot succeed and will not be retried. ${reason}`);
        } else {
            serviceLogger.error({ err: fallbackError, map: mapName }, "Failed to send fallback notification");
        }
    }
}
