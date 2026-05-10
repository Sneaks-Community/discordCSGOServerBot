/**
 * Notification service
 * Handles sending notifications to users when maps change
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES, config } from "../config/index.js";
import { getCachedUser } from "./cacheService.js";
import { getUsersFollowingMap } from "../db/index.js";
import { getStatsPage, getMapImage } from "../utils/mapUtils.js";
import { withRetry } from "../utils/retry.js";
import { validateChannelForSend } from "../utils/permissions.js";
import { serviceLogger, warn, error } from "../utils/logger.js";

// Store bot reference for fallback notifications
let botInstance = null;

/**
 * Initialize the notification service with bot instance
 * @param {Object} bot - The Discord bot client
 */
export function initNotificationService(bot) {
    botInstance = bot;
}

/**
 * Send notifications to users following a map
 * @param {string} map - The map name
 * @param {Object} serverObj - The server object with player info
 * @param {Object} bot - The Discord bot client
 * @param {Object} logChannel - The log channel for notifications
 */
export async function notifyUsers(map, serverObj, bot, logChannel) {
    const server = serverObj?.nick ?? "unknown server";
    const ip = serverObj?.ip ?? "unknown IP";
    const users = await getUsersFollowingMap(map);

    // Track notification rate to prevent spam
    const notificationRateLimit = new Map();
    const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
    const MAX_NOTIFICATIONS_PER_USER = 1; // Max 1 notification per user per minute

    for (const user of users) {
        const stats = getStatsPage(map);
        const mapImage = getMapImage(map);

        // Fetch user first to ensure we have a valid reference
        let u;
        try {
            u = await getCachedUser(user.discord_id, bot);
        } catch (fetchError) {
            warn(`Failed to fetch user ${user.discord_id}:`, fetchError.message);
            u = null;
        }

        try {
            if (!u) {
                // User fetch failed, send fallback notification to log channel
                await sendFallbackNotification(map, server, serverObj, ip, stats, mapImage);
                continue;
            }

            // Rate limiting: Check if user has received too many notifications recently
            const now = Date.now();
            if (!notificationRateLimit.has(user.discord_id)) {
                notificationRateLimit.set(user.discord_id, []);
            }
            const userNotifications = notificationRateLimit.get(user.discord_id);
      
            // Filter out notifications older than the rate limit window
            const recentNotifications = userNotifications.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);
      
            if (recentNotifications.length >= MAX_NOTIFICATIONS_PER_USER) {
                // Skip notification to prevent spam
                continue;
            }
      
            // Record this notification
            recentNotifications.push(now);
            notificationRateLimit.set(user.discord_id, recentNotifications);

            // Prepare the embed for the direct message
            const dmEmbed = new EmbedBuilder()
                .setTitle(`${map} is now on ${server}`)
                .setDescription(
                    `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
                )
                .setColor(CONFIG_VALUES.EMBED_COLOR)
                .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
                .setTimestamp(Date.now());

            if (stats) dmEmbed.setURL(stats);

            if (mapImage) dmEmbed.setImage(mapImage);

            // Send the direct message to the user with proper error handling
            await u.send({
                embeds: [dmEmbed],
                content: `${map} is now on ${server}!\nsteam://connect/${ip}`
            });

            // Log the successful notification (without exposing user's full identity)
            const logEmbed = new EmbedBuilder()
                .setTitle("Notification sent")
                .setColor(CONFIG_VALUES.EMBED_COLOR)
                .setTimestamp(Date.now())
                .setDescription(`Notification sent to user <@${user.discord_id}> for map ${map}`)
                .setAuthor({ name: u.tag, iconURL: u.displayAvatarURL() })
                .setThumbnail(u.displayAvatarURL());

            if (logChannel) {
                logChannel.send({ embeds: [logEmbed] });
            }
            serviceLogger.info(`Sent notification to ${u.tag} about ${map}`);
        } catch (e) {
            // Handle failed DM (user may have DMs disabled or other issues)
            const userId = u?.id || user.discord_id;
            warn(`Failed to send DM to user <@${userId}> about ${map}:`, e.message);

            // Send fallback notification to log channel (without user mention)
            await sendFallbackNotification(map, server, serverObj, ip, stats, mapImage);
        }
    }
}

/**
 * Send fallback notification to the configured channel
 * @param {string} map - The map name
 * @param {string} server - The server name
 * @param {Object} serverObj - The server object
 * @param {string} ip - The server IP
 * @param {string|false} stats - Stats URL
 * @param {string|false} mapImage - Map image URL
 */
async function sendFallbackNotification(map, server, serverObj, ip, stats, mapImage) {
    const backupEmbed = new EmbedBuilder()
        .setTitle(`${map} is now on ${server}`)
        .setDescription(
            `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
        )
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
        .setTimestamp(Date.now());

    if (stats) backupEmbed.setURL(stats);
    if (mapImage) backupEmbed.setImage(mapImage);

    const fallbackContent = `${map} is now on ${server}!\nsteam://connect/${ip}`;

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
            channel.send({
                embeds: [backupEmbed],
                content: fallbackContent
            });
        });
    } catch (fallbackError) {
        error(`Failed to send fallback notification for ${map}:`, fallbackError);
    }
}
