/**
 * Player-related slash command handlers
 * Handles /players, /map, and /keywords commands
 */

import { isServerDataEmpty, getServerData, getServerByKeyword } from "../services/serverService.js";
import { playerListEmbed, makeServerList } from "../embeds/playerEmbeds.js";
import { makeMapEmbed, makeOfflineEmbed } from "../embeds/serverEmbeds.js";
import { getMapImage } from "../utils/mapUtils.js";
import serverObject from "../../servers.json" with { type: "json" };

/**
 * Handle /players slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashPlayers(interaction) {
    if (isServerDataEmpty()) {
        return interaction.reply({ content: "Please Wait. The bot is starting.", ephemeral: true });
    }

    const serverInput = interaction.options.getString("server");
  
    if (!serverInput) {
        const serverData = getServerData();
        const embed = makeServerList(serverData);
        return interaction.reply({ embeds: [embed] });
    }

    const server = getServerByKeyword(serverInput.toLowerCase());
  
    if (!server) {
        return interaction.reply({ content: "Please enter a valid server.", ephemeral: true });
    }

    const embed = playerListEmbed(server);
    await interaction.reply({ embeds: [embed] });
}

/**
 * Handle /map slash command
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashMap(interaction) {
    if (isServerDataEmpty()) {
        return interaction.reply({ content: "Please Wait. The bot is starting.", ephemeral: true });
    }

    const serverInput = interaction.options.getString("server");
  
    if (!serverInput) {
        const serverData = getServerData();
        const embed = makeServerList(serverData);
        return interaction.reply({ embeds: [embed] });
    }

    const server = getServerByKeyword(serverInput.toLowerCase());
  
    if (!server) {
        const isMap = getMapImage(serverInput);
        let res;
    
        if (isMap) {
            res = await fetch(isMap, { method: "HEAD" });
        }
    
        if (!isMap || !res?.ok) {
            return interaction.reply({ content: "Please choose a valid server/map.", ephemeral: true });
        }
    
        const embed = makeMapEmbed(serverInput);
        return interaction.reply({ embeds: [embed] });
    }

    let embed;
    if (server.online) {
        embed = makeMapEmbed(server.map, server);
    } else {
        embed = makeOfflineEmbed(server.name);
    }

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