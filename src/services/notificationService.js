/**
 * Notification service
 * Handles sending notifications to users when maps change
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES, config } from "../config/index.js";
import { getUsersFollowingMap } from "../db/index.js";
import { mapNameSchema } from "../schemas/validationSchemas.js";
import { serviceLogger } from "../utils/logger.js";
import { getMapImage, normalizeMapName } from "../utils/mapUtils.js";
import { validateChannelForSend } from "../utils/permissions.js";
import { withRetry } from "../utils/retry.js";
import { validateWithZod } from "../utils/zodValidator.js";
import { getCachedUser } from "./cacheService.js";

// Store bot reference for fallback notifications
let botInstance = null;

// Store log channel reference for notification success logs (set from bot.js once ready)
let notificationLogChannel = null;

// Track notification rate to prevent spam (module-level to persist across calls)
const notificationRateLimit = new Map();
const NOTIFICATION_RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const NOTIFICATION_MAX_PER_USER = 1; // Max 1 notification per user per minute

/**
 * Initialize the notification service with bot instance
 * @param {Object} bot - The Discord bot client
 */
export function initNotificationService(bot) {
    botInstance = bot;
}

/**
 * Set the log channel used for notification success logs
 * @param {Object} channel - The Discord log channel
 */
export function setNotificationLogChannel(channel) {
    notificationLogChannel = channel;
}

/**
 * Clean up expired notification rate limit entries
 */
function cleanupNotificationRateLimit() {
    const now = Date.now();
    for (const [userId, timestamps] of notificationRateLimit.entries()) {
        const valid = timestamps.filter(ts => now - ts < NOTIFICATION_RATE_LIMIT_WINDOW_MS);
        if (valid.length === 0) {
            notificationRateLimit.delete(userId);
        } else {
            notificationRateLimit.set(userId, valid);
        }
    }
}

// Clean up expired entries every 5 minutes
setInterval(cleanupNotificationRateLimit, 300000);

/**
 * Send notifications to users following a map
 * @param {string} map - The map name as reported by the game server
 * @param {Object} serverObj - The server object with player info
 * @param {Object} [bot] - The Discord bot client (defaults to the instance set via initNotificationService)
 * @param {Object} [logChannel] - The log channel for success logs (defaults to the channel set via setNotificationLogChannel)
 */
export async function notifyUsers(map, serverObj, bot = botInstance, logChannel = notificationLogChannel) {
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

    const users = await getUsersFollowingMap(validatedMap.data);

    for (const user of users) {
        const mapImage = getMapImage(mapName);

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
                continue;
            }

            // Rate limiting: Check if user has received too many notifications recently
            const now = Date.now();
            if (!notificationRateLimit.has(user.discord_id)) {
                notificationRateLimit.set(user.discord_id, []);
            }
            const userNotifications = notificationRateLimit.get(user.discord_id);
      
            // Filter out notifications older than the rate limit window
            const recentNotifications = userNotifications.filter(timestamp => now - timestamp < NOTIFICATION_RATE_LIMIT_WINDOW_MS);
      
            if (recentNotifications.length >= NOTIFICATION_MAX_PER_USER) {
                // Skip notification to prevent spam
                continue;
            }
      
            // Record this notification
            recentNotifications.push(now);
            notificationRateLimit.set(user.discord_id, recentNotifications);

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

            // Log the successful notification (without exposing user's full identity)
            const logEmbed = new EmbedBuilder()
                .setTitle("Notification sent")
                .setColor(CONFIG_VALUES.EMBED_COLOR)
                .setTimestamp(Date.now())
                .setDescription(`Notification sent to user <@${user.discord_id}> for map ${mapName}`)
                .setAuthor({ iconURL: u.displayAvatarURL(), name: u.tag })
                .setThumbnail(u.displayAvatarURL());

            if (logChannel) {
                logChannel.send({ embeds: [logEmbed] }).catch(err => {
                    serviceLogger.warn({ err }, "Failed to send notification log");
                });
            }
            serviceLogger.info({ map: mapName, userId: u.id }, "Sent notification");
        } catch (e) {
            // Handle failed DM (user may have DMs disabled or other issues)
            const userId = u?.id || user.discord_id;
            serviceLogger.warn({ err: e, map: mapName, userId }, "Failed to send DM to user");

            // Send fallback notification to log channel (without user mention)
            await sendFallbackNotification(mapName, server, serverObj, ip, mapImage);
        }
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
            // Validate permissions before sending
            const permCheck = validateChannelForSend(channel);
            if (!permCheck.valid) {
                throw new Error(`Fallback channel permission error: ${permCheck.error}`);
            }
            await channel.send({
                content: fallbackContent,
                embeds: [backupEmbed]
            });
        });
    } catch (fallbackError) {
        serviceLogger.error({ err: fallbackError, map: mapName }, "Failed to send fallback notification");
    }
}
