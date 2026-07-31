/**
 * Admin slash command handlers
 * Handles /listallfollows, /testnotify, and /removeuser commands
 */

import { MessageFlags } from "discord.js";

import { getAllFollows, hasMap, unfollowAll } from "../db/index.js";
import { discordIdSchema, mapNameSchema } from "../schemas/validationSchemas.js";
import { notifyUsers } from "../services/notificationService.js";
import { replyWithPagedEmbed } from "../utils/pagination.js";
import { validateWithZod } from "../utils/zodValidator.js";

/**
 * Handle /listallfollows slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashListallfollows(interaction) {
    const follows = getAllFollows();

    // Guard before sorting: sorting a null/undefined result would throw first
    if (!follows || follows.length === 0) {
        return interaction.reply({ content: "There are no users following any maps.", flags: MessageFlags.Ephemeral });
    }

    follows.sort((a, b) => {
        if (a.discord_id < b.discord_id) return -1;
        if (a.discord_id > b.discord_id) return 1;
        return 0;
    });

    // This list grows with every follow in the database and would blow past the
    // 4096 character embed description limit at roughly 130 rows, so it is paged
    // rather than truncated: an admin needs to be able to read all of it.
    const lines = follows.map((follow) => `<@${follow.discord_id}>: ${follow.map_name}`);

    await replyWithPagedEmbed(interaction, {
        ephemeral: true,
        lines,
        title: `List of all followed maps (${follows.length}):`
    });
}

/**
 * Handle /testnotify slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 * @param {Object} bot - Discord bot client
 */
export async function handleSlashTestnotify(interaction, bot) {
    // notifyUsers DMs each follower serially, which can outrun Discord's 3 second
    // reply deadline. Defer up front; every reply on this command is ephemeral, so
    // the flag carries over to each editReply below.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const map = interaction.options.getString("map");

    if (!map) {
        return interaction.editReply({ content: "Please enter a valid map name." });
    }

    // Validate map name using Zod v4 schema
    const mapValidation = validateWithZod(mapNameSchema, map, "Map name");
    if (!mapValidation.valid) {
        return interaction.editReply({ content: mapValidation.error });
    }
    const sanitizedMap = mapValidation.data;

    if (!hasMap(sanitizedMap)) {
        return interaction.editReply({ content: "No one is following this map." });
    }

    await notifyUsers(sanitizedMap, { ip: "0.0.0.0:27015", nick: "Test Server" }, bot);
    await interaction.editReply({ content: `Notification sent for map: ${sanitizedMap}` });
}

/**
 * Handle /removeuser slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashRemoveuser(interaction) {
    const userID = interaction.options.getString("userid");
  
    if (!userID) {
        return interaction.reply({ content: "Please enter a valid user ID.", flags: MessageFlags.Ephemeral });
    }

    // Validate Discord ID using Zod v4 schema
    const userIdValidation = validateWithZod(discordIdSchema, userID, "User ID");
    if (!userIdValidation.valid) {
        return interaction.reply({ content: userIdValidation.error, flags: MessageFlags.Ephemeral });
    }

    unfollowAll(userIdValidation.data);
    // The only reply that renders a real mention in content rather than in an embed.
    // Ephemeral replies do not notify anyone today, but P0-4 showed how easily that
    // flag gets dropped, so the mention is denied here rather than relied upon.
    await interaction.reply({ allowedMentions: { parse: [] }, content: `Removed all maps from user <@${userID}>.`, flags: MessageFlags.Ephemeral });
}