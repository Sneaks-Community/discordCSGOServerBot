/**
 * Player-related slash command handlers
 * Handles /players and /keywords commands
 */

import { MessageFlags } from "discord.js";

import serverObject from "../../servers.json" with { type: "json" };
import { playerListEmbed, makeServerList } from "../embeds/playerEmbeds.js";
import { isServerDataEmpty, getServerData, getServerByKeyword } from "../services/serverService.js";
import { joinWithinLimit, MESSAGE_CONTENT_LIMIT } from "../utils/truncate.js";

/**
 * Handle /players slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashPlayers(interaction) {
    if (isServerDataEmpty()) {
        return interaction.reply({ content: "Please Wait. The bot is starting.", flags: MessageFlags.Ephemeral });
    }

    const serverInput = interaction.options.getString("server");
  
    if (!serverInput) {
        const serverData = getServerData();
        const embed = makeServerList(serverData);
        return interaction.reply({ embeds: [embed] });
    }

    const server = getServerByKeyword(serverInput.toLowerCase());
  
    if (!server) {
        return interaction.reply({ content: "Please enter a valid server.", flags: MessageFlags.Ephemeral });
    }

    const embed = playerListEmbed(server);
    await interaction.reply({ embeds: [embed] });
}

/**
 * Handle /keywords slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashKeywords(interaction) {
    // 25 servers with several keywords each can pass the 2000 character content
    // limit, which rejects the whole reply, so drop whole server entries instead.
    const entries = Object.values(serverObject).map((server) => {
        const keywords = server.keywords.map((k) => `\t${k}`).join("");
        return `**${server.nick}:**\n${keywords}`;
    });

    const content = joinWithinLimit(entries, MESSAGE_CONTENT_LIMIT);

    await interaction.reply({ content: content || "No servers configured." });
}