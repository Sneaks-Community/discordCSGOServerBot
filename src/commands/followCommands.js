/**
 * Follow-related slash command handlers
 * Handles /follow, /unfollow, and /listfollows commands
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { followMap, unfollowMap, getUserFollows, isFollowingMap, unfollowAll } from "../db/index.js";
import { createFollowLogEmbed } from "../embeds/notificationEmbeds.js";
import { discordIdSchema, mapNameSchema } from "../schemas/validationSchemas.js";
import { checkRateLimit } from "../services/cacheService.js";
import { escapeForDiscord } from "../utils/discordEscape.js";
import { commandLogger } from "../utils/logger.js";
import { getStatsPage } from "../utils/mapUtils.js";
import { validateWithZod } from "../utils/zodValidator.js";

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
 */
export async function handleSlashFollow(interaction) {
    const rawMap = interaction.options.getString("map");

    // Validate Discord ID first
    const userIdValidation = validateWithZod(discordIdSchema, interaction.user.id, "User ID");
    if (!userIdValidation.valid) {
        return interaction.reply({ content: userIdValidation.error, ephemeral: true });
    }
    const sanitizedUserId = userIdValidation.data;

    const rateLimitResult = checkRateLimit(sanitizedUserId, "follow", CONFIG_VALUES.FOLLOW_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before following another map.`, ephemeral: true });
    }

    // Validate map name using Zod v4 schema (includes lowercase transform)
    const mapValidation = validateWithZod(mapNameSchema, rawMap, "Map name");
    if (!mapValidation.valid) {
        return interaction.reply({ content: mapValidation.error, ephemeral: true });
    }
    const sanitizedMap = mapValidation.data;

    if (await isFollowingMap(sanitizedUserId, sanitizedMap)) {
        return interaction.reply({ content: "You are already following this map.", ephemeral: true });
    }

    await followMap(sanitizedUserId, sanitizedMap);

    await interaction.reply({ content: `You are now following ${sanitizedMap}. You will be notified when the map comes on a server.`, ephemeral: true });

    commandLogger.info(`${interaction.user.tag} followed map ${sanitizedMap}`);

    const logEmbed = createFollowLogEmbed("Followed", interaction.user, sanitizedMap);

    if (logChannel) {
        logChannel.send({ embeds: [logEmbed] }).catch(err => {
            commandLogger.error("Failed to send follow log:", err);
        });
    }
}

/**
 * Handle /unfollow slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashUnfollow(interaction) {
    const rawMap = interaction.options.getString("map");

    // Validate Discord ID first
    const userIdValidation = validateWithZod(discordIdSchema, interaction.user.id, "User ID");
    if (!userIdValidation.valid) {
        return interaction.reply({ content: userIdValidation.error, ephemeral: true });
    }
    const sanitizedUserId = userIdValidation.data;

    const rateLimitResult = checkRateLimit(sanitizedUserId, "unfollow", CONFIG_VALUES.UNFOLLOW_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before unfollowing another map.`, ephemeral: true });
    }

    // "all" is a special keyword that bypasses map name validation
    if (rawMap === "all") {
        await unfollowAll(sanitizedUserId);
        await interaction.reply({ content: "You are no longer following any maps.", ephemeral: true });
        commandLogger.info(`${interaction.user.tag} unfollowed all maps`);
    } else {
        // Validate map name using Zod v4 schema (includes lowercase transform)
        const mapValidation = validateWithZod(mapNameSchema, rawMap, "Map name");
        if (!mapValidation.valid) {
            return interaction.reply({ content: mapValidation.error, ephemeral: true });
        }
        const sanitizedMap = mapValidation.data;

        if (!(await isFollowingMap(sanitizedUserId, sanitizedMap))) {
            return interaction.reply({ content: "You are not following this map. Use `/listfollows` to see a list of maps you are following.", ephemeral: true });
        }

        await unfollowMap(sanitizedUserId, sanitizedMap);
        await interaction.reply({ content: `You are no longer following ${sanitizedMap}.`, ephemeral: true });
        commandLogger.info(`${interaction.user.tag} unfollowed map ${sanitizedMap}`);
    }

    const logEmbed = createFollowLogEmbed(rawMap === "all" ? "Unfollowed" : "Unfollowed", interaction.user, rawMap === "all" ? "all" : rawMap);

    if (logChannel) {
        logChannel.send({ embeds: [logEmbed] }).catch(err => {
            commandLogger.error("Failed to send unfollow log:", err);
        });
    }
}

/**
 * Handle /listfollows slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashListfollows(interaction) {
    // Validate Discord ID
    const userIdValidation = validateWithZod(discordIdSchema, interaction.user.id, "User ID");
    if (!userIdValidation.valid) {
        return interaction.reply({ content: userIdValidation.error, ephemeral: true });
    }
    const sanitizedUserId = userIdValidation.data;

    const follows = await getUserFollows(sanitizedUserId);
  
    if (follows.length === 0) {
        return interaction.reply({ content: "You are not following any maps.", ephemeral: true });
    }

    let list = "";
    for (const follow of follows) {
        const stats = getStatsPage(follow.map_name);
        list += stats ? `[${escapeForDiscord(follow.map_name)}](${stats})\n` : `${escapeForDiscord(follow.map_name)}\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle("List of maps you are following:")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .setDescription(list);

    await interaction.reply({ embeds: [embed] });
}
