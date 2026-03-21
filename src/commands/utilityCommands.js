/**
 * Utility slash command handlers
 * Handles /help, /ping, and /version commands
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import pkg from "../../package.json" with { type: "json" };

/**
 * Handle /help slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("List of commands")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .addFields(
            { name: "/players [server]", value: "Show players on a server" },
            { name: "/map [server]", value: "Show current map on a server or map stats" },
            { name: "/keywords", value: "List all available server keywords" },
            { name: "/follow <map>", value: "Follow a map to receive DM notifications" },
            { name: "/unfollow <map|all>", value: "Stop following a map or all maps" },
            { name: "/listfollows", value: "List all maps you are following" },
            { name: "/ping", value: "Check bot latency" },
            { name: "/version", value: "Show bot version" }
        );

    await interaction.reply({ embeds: [embed] });
}

/**
 * Handle /ping slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashPing(interaction) {
    await interaction.reply({ content: "🏓 Pong!", ephemeral: true });
}

/**
 * Handle /version slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashVersion(interaction) {
    await interaction.reply({ content: pkg.version, ephemeral: true });
}