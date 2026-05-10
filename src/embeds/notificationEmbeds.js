/**
 * Notification embed builders
 * Creates Discord embeds for notifications and logging
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";

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
            iconURL: user.displayAvatarURL(),
            name: user.tag
        });

    return embed;
}