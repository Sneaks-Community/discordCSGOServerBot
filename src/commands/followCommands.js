/**
 * Follow-related slash command handlers
 * Handles /follow, /unfollow, and /listfollows commands
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { checkRateLimit } from "../services/cacheService.js";
import { validateMapName } from "../utils/validation.js";
import { followMap, unfollowMap, getUserFollows, isFollowingMap, unfollowAll } from "../db/index.js";
import { getStatsPage } from "../utils/mapUtils.js";
import { createFollowLogEmbed } from "../embeds/notificationEmbeds.js";
import { commandLogger } from "../utils/logger.js";

// Will be set by bot.js
let logChannel = null;

/**
 * Set the log channel for follow commands
 * @param {Object} channel - The Discord log channel
 */
export function setFollowLogChannel(channel) {
    logChannel = channel;
}

/**
 * Handle /follow slash command
 * @param {Object} interaction - Discord interaction object
 * @param {Object} Discord - Discord.js library for mention patterns
 */
export async function handleSlashFollow(interaction, Discord) {
    const map = interaction.options.getString("map").toLowerCase();

    const rateLimitResult = checkRateLimit(interaction.user.id, "follow", CONFIG_VALUES.FOLLOW_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before following another map.`, ephemeral: true });
    }

    const validation = validateMapName(map, Discord);
    if (!validation.valid) {
        return interaction.reply({ content: validation.error, ephemeral: true });
    }

    if (await isFollowingMap(interaction.user.id, map)) {
        return interaction.reply({ content: "You are already following this map.", ephemeral: true });
    }

    await followMap(interaction.user.id, map);

    await interaction.reply({ content: `You are now following ${map}. You will be notified when the map comes on a server.`, ephemeral: true });

    commandLogger.info(`${interaction.user.tag} followed map ${map}`);

    const logEmbed = createFollowLogEmbed("Followed", interaction.user, map);

    if (logChannel) {
        logChannel.send({ embeds: [logEmbed] });
    }
}

/**
 * Handle /unfollow slash command
 * @param {Object} interaction - Discord interaction object
 * @param {Object} Discord - Discord.js library for mention patterns
 */
export async function handleSlashUnfollow(interaction, Discord) {
    const map = interaction.options.getString("map").toLowerCase();

    const rateLimitResult = checkRateLimit(interaction.user.id, "unfollow", CONFIG_VALUES.UNFOLLOW_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before unfollowing another map.`, ephemeral: true });
    }

    const validation = validateMapName(map, Discord);
    if (!validation.valid) {
        return interaction.reply({ content: validation.error, ephemeral: true });
    }

    if (map === "all") {
        await unfollowAll(interaction.user.id);
        await interaction.reply({ content: "You are no longer following any maps.", ephemeral: true });
        commandLogger.info(`${interaction.user.tag} unfollowed all maps`);
    } else {
        if (!(await isFollowingMap(interaction.user.id, map))) {
            return interaction.reply({ content: "You are not following this map. Use `/listfollows` to see a list of maps you are following.", ephemeral: true });
        }

        await unfollowMap(interaction.user.id, map);
        await interaction.reply({ content: `You are no longer following ${map}.`, ephemeral: true });
        commandLogger.info(`${interaction.user.tag} unfollowed map ${map}`);
    }

    const logEmbed = createFollowLogEmbed("Unfollowed", interaction.user, map);

    if (logChannel) {
        logChannel.send({ embeds: [logEmbed] });
    }
}

/**
 * Handle /listfollows slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashListfollows(interaction) {
    const follows = await getUserFollows(interaction.user.id);
  
    if (follows.length === 0) {
        return interaction.reply({ content: "You are not following any maps.", ephemeral: true });
    }

    let list = "";
    for (const follow of follows) {
        const stats = getStatsPage(follow.map_name);
        if (stats) {
            list += `[${follow.map_name}](${stats})\n`;
        } else {
            list += `${follow.map_name}\n`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle("List of maps you are following:")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .setDescription(list);

    await interaction.reply({ embeds: [embed] });
}
