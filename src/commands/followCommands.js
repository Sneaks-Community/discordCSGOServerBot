/**
 * Follow-related slash command handlers
 * Handles /follow, /unfollow, and /listfollows commands
 */

import { MessageFlags } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { followMap, unfollowMap, countUserFollows, getUserFollows, isFollowingMap, unfollowAll } from "../db/index.js";
import { discordIdSchema, mapNameSchema } from "../schemas/validationSchemas.js";
import { checkRateLimit } from "../services/cacheService.js";
import { escapeForDiscord } from "../utils/discordEscape.js";
import { commandLogger } from "../utils/logger.js";
import { replyWithPagedEmbed } from "../utils/pagination.js";
import { validateWithZod } from "../utils/zodValidator.js";

/**
 * Handle /follow slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashFollow(interaction) {
    const rawMap = interaction.options.getString("map");

    // Validate Discord ID first
    const userIdValidation = validateWithZod(discordIdSchema, interaction.user.id, "User ID");
    if (!userIdValidation.valid) {
        return interaction.reply({ content: userIdValidation.error, flags: MessageFlags.Ephemeral });
    }
    const sanitizedUserId = userIdValidation.data;

    const rateLimitResult = checkRateLimit(sanitizedUserId, "follow", CONFIG_VALUES.FOLLOW_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before following another map.`, flags: MessageFlags.Ephemeral });
    }

    // Validate map name using Zod v4 schema (includes lowercase transform)
    const mapValidation = validateWithZod(mapNameSchema, rawMap, "Map name");
    if (!mapValidation.valid) {
        return interaction.reply({ content: mapValidation.error, flags: MessageFlags.Ephemeral });
    }
    const sanitizedMap = mapValidation.data;

    if (await isFollowingMap(sanitizedUserId, sanitizedMap)) {
        return interaction.reply({ content: "You are already following this map.", flags: MessageFlags.Ephemeral });
    }

    // Lifetime cap, checked after the duplicate test so re-following a map already
    // on the list can never be refused. The per-minute rate limit only paces
    // follows; this is what actually bounds one user's rows, list length and
    // notification fanout.
    const followCount = await countUserFollows(sanitizedUserId);
    if (followCount >= CONFIG_VALUES.MAX_FOLLOWS_PER_USER) {
        return interaction.reply({
            content: `You are already following the maximum of ${CONFIG_VALUES.MAX_FOLLOWS_PER_USER} maps. Use \`/unfollow <map>\` to make room, or \`/unfollow all\` to start over.`,
            flags: MessageFlags.Ephemeral
        });
    }

    await followMap(sanitizedUserId, sanitizedMap);

    await interaction.reply({ content: `You are now following ${sanitizedMap}. You will be notified when the map comes on a server.`, flags: MessageFlags.Ephemeral });

    commandLogger.info({ map: sanitizedMap, userId: sanitizedUserId, username: interaction.user.tag }, "User followed map");
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
        return interaction.reply({ content: userIdValidation.error, flags: MessageFlags.Ephemeral });
    }
    const sanitizedUserId = userIdValidation.data;

    const rateLimitResult = checkRateLimit(sanitizedUserId, "unfollow", CONFIG_VALUES.UNFOLLOW_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before unfollowing another map.`, flags: MessageFlags.Ephemeral });
    }

    // "all" is a special keyword that bypasses map name validation
    if (rawMap === "all") {
        await unfollowAll(sanitizedUserId);
        await interaction.reply({ content: "You are no longer following any maps.", flags: MessageFlags.Ephemeral });
        commandLogger.info({ userId: sanitizedUserId, username: interaction.user.tag }, "User unfollowed all maps");
    } else {
        // Validate map name using Zod v4 schema (includes lowercase transform)
        const mapValidation = validateWithZod(mapNameSchema, rawMap, "Map name");
        if (!mapValidation.valid) {
            return interaction.reply({ content: mapValidation.error, flags: MessageFlags.Ephemeral });
        }
        const sanitizedMap = mapValidation.data;

        if (!(await isFollowingMap(sanitizedUserId, sanitizedMap))) {
            return interaction.reply({ content: "You are not following this map. Use `/listfollows` to see a list of maps you are following.", flags: MessageFlags.Ephemeral });
        }

        await unfollowMap(sanitizedUserId, sanitizedMap);
        await interaction.reply({ content: `You are no longer following ${sanitizedMap}.`, flags: MessageFlags.Ephemeral });
        commandLogger.info({ map: sanitizedMap, userId: sanitizedUserId, username: interaction.user.tag }, "User unfollowed map");
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
        return interaction.reply({ content: userIdValidation.error, flags: MessageFlags.Ephemeral });
    }
    const sanitizedUserId = userIdValidation.data;

    const follows = await getUserFollows(sanitizedUserId);
  
    if (follows.length === 0) {
        return interaction.reply({ content: "You are not following any maps.", flags: MessageFlags.Ephemeral });
    }

    // Until follows are capped per user this list is unbounded, so page it rather
    // than risk a rejected reply once it passes the description limit.
    const lines = follows.map((follow) => escapeForDiscord(follow.map_name));

    await replyWithPagedEmbed(interaction, {
        lines,
        title: `List of maps you are following (${follows.length}):`
    });
}
