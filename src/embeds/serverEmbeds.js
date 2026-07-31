/**
 * Server embed builders
 * Creates Discord embeds for server lists and status
 */

import { CONFIG_VALUES } from "../config/index.js";
import { escapeForDiscord } from "../utils/discordEscape.js";
import { createBaseEmbed } from "./baseEmbed.js";

/**
 * Describe an interval in words, for the embed description.
 *
 * SERVER_UPDATE_INTERVAL is validated at 30 seconds or more, so both units are
 * reachable. Minutes are rounded to one decimal so the default 90s still reads as
 * "1.5 minutes" rather than "2 minutes".
 * @param {number} ms - The interval in milliseconds
 * @returns {string} - e.g. "45 seconds", "1 minute", "1.5 minutes"
 */
export function describeInterval(ms) {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) {
        return `${seconds} second${seconds === 1 ? "" : "s"}`;
    }

    const minutes = Math.round((seconds / 60) * 10) / 10;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Create a main server list embed
 * @param {Object} serverData - The server data object
 * @returns {EmbedBuilder} - The Discord embed
 */
export function makeEmbed(serverData) {
    const embed = createBaseEmbed("Server List")
        .setDescription(`This list is updated every ${describeInterval(CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS)}.`);

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