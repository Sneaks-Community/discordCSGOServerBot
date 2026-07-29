/**
 * Admin slash command handlers
 * Handles /listallfollows, /testnotify, /removeuser, and /mem commands
 */

import { EmbedBuilder, MessageFlags } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { getAllFollows, hasMap, unfollowAll } from "../db/index.js";
import { discordIdSchema, mapNameSchema } from "../schemas/validationSchemas.js";
import { notifyUsers } from "../services/notificationService.js";
import { validateWithZod } from "../utils/zodValidator.js";

/**
 * Handle /listallfollows slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashListallfollows(interaction) {
    const follows = await getAllFollows();

    follows.sort((a, b) => {
        if (a.discord_id < b.discord_id) return -1;
        if (a.discord_id > b.discord_id) return 1;
        return 0;
    });

    if (!follows || follows.length === 0) {
        return interaction.reply({ content: "There are no users following any maps.", flags: MessageFlags.Ephemeral });
    }

    let list = "";
    for (const follow of follows) {
        list += `<@${follow.discord_id}>: ${follow.map_name}\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle("List of all followed maps:")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .setDescription(list);

    await interaction.reply({ embeds: [embed] });
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

    if (!(await hasMap(sanitizedMap))) {
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

    await unfollowAll(userIdValidation.data);
    await interaction.reply({ content: `Removed all maps from user <@${userID}>.`, flags: MessageFlags.Ephemeral });
}

/**
 * Handle /mem slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashMem(interaction) {
    const used = process.memoryUsage();
    let out = "```";
    for (const key in used) {
        out += `${key} ${Math.round((used[key] / 1024 / 1024) * 100) / 100} MB\n`;
    }
    out += "```";

    await interaction.reply({ content: out, flags: MessageFlags.Ephemeral });
}