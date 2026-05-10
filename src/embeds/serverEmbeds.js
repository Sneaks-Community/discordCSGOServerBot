/**
 * Server embed builders
 * Creates Discord embeds for server lists and status
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { getWebsite, getMapImage, getStatsPage } from "../utils/mapUtils.js";

/**
 * Create a main server list embed
 * @param {Object} serverData - The server data object
 * @returns {EmbedBuilder} - The Discord embed
 */
export function makeEmbed(serverData) {
    // Create a new Discord embed with the title and other details using EmbedBuilder
    const embed = new EmbedBuilder()
        .setTitle("Server List")
        .setDescription("This list is updated every 1.5 minutes.")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
        .setTimestamp(Date.now());

    // Iterate through the servers and add server details to the embed
    for (const server of Object.values(serverData)) {
        if (!server.online) {
            // If the server is offline, add a field indicating it's not available
            embed.addFields({
                inline: true,
                name: server.name,
                value: "**Server is not available.**"
            });
            continue;
        }

        if (!server.show) continue; // Skip servers that shouldn't be displayed

        // Add a field for the online server with player, map, and IP details
        embed.addFields({
            inline: true,
            name: server.name,
            value: `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}\n**__Map:__** ${getWebsite(server.map)}\n**__IP:__** ${
                server.fullIP
            }`
        });
    }

    return embed;
}

/**
 * Create a map embed with optional server information
 * @param {string} mapName - The map name
 * @param {Object|null} server - Optional server object
 * @returns {EmbedBuilder} - The Discord embed
 */
export function makeMapEmbed(mapName, server = null) {
    const image = getMapImage(mapName);
    const stats = getStatsPage(mapName);

    // Create a new Discord EmbedBuilder instance
    const embed = new EmbedBuilder()
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
        .setTimestamp(Date.now());

    // Set the embed URL if a stats page is available
    if (stats) {
        embed.setURL(stats);
    }

    // Set the embed image if an image is available
    if (image) {
        embed.setImage(image);
    }

    // Set the embed title based on whether a server is provided
    if (server) {
        embed.setTitle(`${server.name} is currently on ${mapName}`.replace(/_/g, "\\_"));
    } else {
        embed.setTitle(`${mapName} stats`.replace(/_/g, "\\_"));
    }

    return embed;
}

/**
 * Create an offline server embed
 * @param {string} serverName - The server name
 * @returns {EmbedBuilder} - The Discord embed
 */
export function makeOfflineEmbed(serverName) {
    return new EmbedBuilder()
        .setTitle(`${serverName} is currently unavailable.`)
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
        .setTimestamp(Date.now())
        .setImage(CONFIG_VALUES.OFFLINE_SERVER_IMAGE);
}