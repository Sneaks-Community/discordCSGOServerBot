/**
 * Server embed builders
 * Creates Discord embeds for server lists and status
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { escapeForDiscord } from "../utils/discordEscape.js";

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
                name: escapeForDiscord(server.name),
                value: "**Server is not available.**"
            });
            continue;
        }

        // Add a field for the online server with player, map, and IP details
        // Use centralized escapeForDiscord which escapes backslashes FIRST (prevents injection)
        embed.addFields({
            inline: true,
            name: escapeForDiscord(server.name),
            value: `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}\n**__Map:__** ${escapeForDiscord(server.map)}\n**__IP:__** ${escapeForDiscord(server.fullIP)}`
        });
    }

    return embed;
}