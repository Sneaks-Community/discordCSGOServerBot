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
 * Validate the invoking user's Discord ID, answering the interaction if it is
 * unusable. Every follow command needs the ID before it can do anything, so the
 * caller only has to check for null.
 *
 * Module-private: nothing outside this file validates the invoker, and the admin
 * commands validate an ID typed as a command option instead, which is a
 * different check with a different failure message.
 * @param {Object} interaction - Discord interaction object
 * @returns {Promise<?string>} - The validated ID, or null if the user was replied to
 */
async function resolveUserId(interaction) {
    const result = validateWithZod(discordIdSchema, interaction.user.id, "User ID");
    if (result.valid) return result.data;

    await interaction.reply({ content: result.error, flags: MessageFlags.Ephemeral });
    return null;
}

/**
 * Apply a per-minute rate limit, answering the interaction when the user is over it.
 * @param {Object} interaction - Discord interaction object
 * @param {Object} options - Options
 * @param {string} options.action - Rate limit key, one bucket per action
 * @param {string} options.gerund - How the action reads in "before ... another map"
 * @param {number} options.limit - Allowed invocations per minute
 * @param {string} options.userId - The validated invoker ID the bucket is keyed on
 * @returns {Promise<boolean>} - Whether the command may proceed
 */
async function enforceRateLimit(interaction, { action, gerund, limit, userId }) {
    const result = checkRateLimit(userId, action, limit);
    if (result.allowed) return true;

    await interaction.reply({ content: `Rate limit exceeded. Please wait ${result.retryAfter} seconds before ${gerund} another map.`, flags: MessageFlags.Ephemeral });
    return false;
}

/**
 * Handle /follow slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashFollow(interaction) {
    const rawMap = interaction.options.getString("map");

    const sanitizedUserId = await resolveUserId(interaction);
    if (!sanitizedUserId) return;

    const withinLimit = await enforceRateLimit(interaction, {
        action: "follow",
        gerund: "following",
        limit: CONFIG_VALUES.FOLLOW_RATE_LIMIT_PER_MINUTE,
        userId: sanitizedUserId
    });
    if (!withinLimit) return;

    // Validate map name using Zod v4 schema (includes lowercase transform)
    const mapValidation = validateWithZod(mapNameSchema, rawMap, "Map name");
    if (!mapValidation.valid) {
        return interaction.reply({ content: mapValidation.error, flags: MessageFlags.Ephemeral });
    }
    const sanitizedMap = mapValidation.data;

    if (isFollowingMap(sanitizedUserId, sanitizedMap)) {
        return interaction.reply({ content: "You are already following this map.", flags: MessageFlags.Ephemeral });
    }

    // Lifetime cap, checked after the duplicate test so re-following a map already
    // on the list can never be refused. The per-minute rate limit only paces
    // follows; this is what actually bounds one user's rows, list length and
    // notification fanout.
    const followCount = countUserFollows(sanitizedUserId);
    if (followCount >= CONFIG_VALUES.MAX_FOLLOWS_PER_USER) {
        return interaction.reply({
            content: `You are already following the maximum of ${CONFIG_VALUES.MAX_FOLLOWS_PER_USER} maps. Use \`/unfollow <map>\` to make room, or \`/unfollow all\` to start over.`,
            flags: MessageFlags.Ephemeral
        });
    }

    followMap(sanitizedUserId, sanitizedMap);

    await interaction.reply({ content: `You are now following ${sanitizedMap}. You will be notified when the map comes on a server.`, flags: MessageFlags.Ephemeral });

    commandLogger.info({ map: sanitizedMap, userId: sanitizedUserId, username: interaction.user.tag }, "User followed map");
}

/**
 * Handle /unfollow slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashUnfollow(interaction) {
    const rawMap = interaction.options.getString("map");

    const sanitizedUserId = await resolveUserId(interaction);
    if (!sanitizedUserId) return;

    const withinLimit = await enforceRateLimit(interaction, {
        action: "unfollow",
        gerund: "unfollowing",
        limit: CONFIG_VALUES.UNFOLLOW_RATE_LIMIT_PER_MINUTE,
        userId: sanitizedUserId
    });
    if (!withinLimit) return;

    // "all" is a special keyword that bypasses map name validation
    if (rawMap === "all") {
        unfollowAll(sanitizedUserId);
        await interaction.reply({ content: "You are no longer following any maps.", flags: MessageFlags.Ephemeral });
        commandLogger.info({ userId: sanitizedUserId, username: interaction.user.tag }, "User unfollowed all maps");
    } else {
        // Validate map name using Zod v4 schema (includes lowercase transform)
        const mapValidation = validateWithZod(mapNameSchema, rawMap, "Map name");
        if (!mapValidation.valid) {
            return interaction.reply({ content: mapValidation.error, flags: MessageFlags.Ephemeral });
        }
        const sanitizedMap = mapValidation.data;

        if (!isFollowingMap(sanitizedUserId, sanitizedMap)) {
            return interaction.reply({ content: "You are not following this map. Use `/listfollows` to see a list of maps you are following.", flags: MessageFlags.Ephemeral });
        }

        unfollowMap(sanitizedUserId, sanitizedMap);
        await interaction.reply({ content: `You are no longer following ${sanitizedMap}.`, flags: MessageFlags.Ephemeral });
        commandLogger.info({ map: sanitizedMap, userId: sanitizedUserId, username: interaction.user.tag }, "User unfollowed map");
    }
}

/**
 * Handle /listfollows slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashListfollows(interaction) {
    const sanitizedUserId = await resolveUserId(interaction);
    if (!sanitizedUserId) return;

    const follows = getUserFollows(sanitizedUserId);
  
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
