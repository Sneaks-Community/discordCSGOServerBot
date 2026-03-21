/**
 * Notification embed builders
 * Creates Discord embeds for notifications and logging
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { getStatsPage, getMapImage } from "../utils/mapUtils.js";

/**
 * Create a DM notification embed for map change
 * @param {string} map - The map name
 * @param {string} server - The server name
 * @param {Object} serverObj - The server object with player info
 * @param {string} ip - The server IP
 * @returns {Object} - { embed: EmbedBuilder, content: string }
 */
export function createDmNotificationEmbed(map, server, serverObj, ip) {
    const stats = getStatsPage(map);
    const mapImage = getMapImage(map);

    const embed = new EmbedBuilder()
        .setTitle(`${map} is now on ${server}`)
        .setDescription(
            `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
        )
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
        .setTimestamp(Date.now());

    if (stats) embed.setURL(stats);
    if (mapImage) embed.setImage(mapImage);

    const content = `${map} is now on ${server}!\nsteam://connect/${ip}`;

    return { embed, content };
}

/**
 * Create a log embed for notification tracking
 * @param {string} userId - The Discord user ID
 * @param {string} map - The map name
 * @param {Object} user - The Discord user object
 * @returns {EmbedBuilder} - The Discord embed
 */
export function createLogEmbed(userId, map, user) {
    const embed = new EmbedBuilder()
        .setTitle("Notification sent")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .setDescription(`Notification sent to user <@${userId}> for map ${map}`);

    if (user) {
        embed.setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() });
        embed.setThumbnail(user.displayAvatarURL());
    }

    return embed;
}

/**
 * Create a follow action log embed
 * @param {string} action - The action type (followed/unfollowed)
 * @param {Object} user - The Discord user object
 * @param {string} map - The map name
 * @returns {EmbedBuilder} - The Discord embed
 */
export function createFollowLogEmbed(action, user, map) {
    const embed = new EmbedBuilder()
        .setTitle(`User ${action} Map`)
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .addFields(
            { name: "User", value: user.toString() },
            { name: "Map", value: map }
        )
        .setThumbnail(user.displayAvatarURL())
        .setAuthor({
            name: user.tag,
            iconURL: user.displayAvatarURL()
        });

    return embed;
}

/**
 * Create a fallback notification embed for failed DMs
 * @param {string} map - The map name
 * @param {string} server - The server name
 * @param {Object} serverObj - The server object
 * @param {string} ip - The server IP
 * @returns {Object} - { embed: EmbedBuilder, content: string }
 */
export function createFallbackEmbed(map, server, serverObj, ip) {
    const stats = getStatsPage(map);
    const mapImage = getMapImage(map);

    const embed = new EmbedBuilder()
        .setTitle(`${map} is now on ${server}`)
        .setDescription(
            `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
        )
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
        .setTimestamp(Date.now());

    if (stats) embed.setURL(stats);
    if (mapImage) embed.setImage(mapImage);

    const content = `${map} is now on ${server}!\nsteam://connect/${ip}`;

    return { embed, content };
}