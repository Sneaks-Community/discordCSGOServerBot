/**
 * Utility slash command handlers
 * Handles /help and /ping commands
 */

import { MessageFlags } from "discord.js";

import { createBaseEmbed } from "../embeds/baseEmbed.js";
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
    // No footer: the command list is not a snapshot of anything, so "Last Updated"
    // would be misleading.
    const embed = createBaseEmbed("List of commands", { footer: null })
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