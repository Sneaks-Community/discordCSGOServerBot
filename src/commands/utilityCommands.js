/**
 * Utility slash command handlers
 * Handles /help and /ping commands
 */

import { EmbedBuilder, MessageFlags } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { hasAdminRole } from "./adminAuth.js";
import { getHelpEntries } from "./definitions.js";

/**
 * Handle /help slash command.
 * The list is generated from the same definitions Discord is registered with, so
 * it cannot drift from what actually exists. Admin commands are listed only for
 * admins: Discord already hides them from the picker, and advertising commands
 * the reader will only be refused is noise.
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("List of commands")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .addFields(getHelpEntries(hasAdminRole(interaction)).map(({ description, usage }) => ({ name: usage, value: description })));

    await interaction.reply({ embeds: [embed] });
}

/**
 * Handle /ping slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashPing(interaction) {
    await interaction.reply({ content: "🏓 Pong!", flags: MessageFlags.Ephemeral });
}