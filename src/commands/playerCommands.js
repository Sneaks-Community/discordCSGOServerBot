/**
 * Player-related slash command handlers
 * Handles /players, /map, and /keywords commands
 */

import { MessageFlags } from "discord.js";

import serverObject from "../../servers.json" with { type: "json" };
import { playerListEmbed, makeServerList } from "../embeds/playerEmbeds.js";
import { isServerDataEmpty, getServerData, getServerByKeyword } from "../services/serverService.js";

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
    let list = "";
    for (const server of Object.values(serverObject)) {
        list += `**${server.nick}:**\n`;
        for (const k of server.keywords) {
            list += `\t${k}`;
        }
        list += "\n";
    }
    await interaction.reply({ content: list });
}