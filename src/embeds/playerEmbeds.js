/**
 * Player embed builders
 * Creates Discord embeds for player lists
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
import { escapeForDiscord, escapeList } from "../utils/discordEscape.js";
import { getWebsite } from "../utils/mapUtils.js";

/**
 * Create a player list embed for a server
 * @param {Object} server - The server data object
 * @returns {EmbedBuilder} - The Discord embed
 */
export function playerListEmbed(server) {
    let embed;

    if (server.online) {
        // Create an embed for the online server using EmbedBuilder
        // Use centralized escapeForDiscord which escapes backslashes FIRST (prevents injection)
        embed = new EmbedBuilder()
            .setTitle(`${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} players connected to ${escapeForDiscord(server.name)} on ${escapeForDiscord(server.map)}`)
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
            .setTimestamp(Date.now());

        // Generate a list of player names and escape them properly
        // Use centralized escapeList which applies escapeForDiscord to each item
        const allPlayerNames = [
            ...server.players.map((player) => player.name),
            ...server.bots.map((bot) => bot.name)
        ];
        const list = escapeList(allPlayerNames);

        embed.setDescription(list);
    } else {
        // Create an embed for the offline server
        // Use centralized escapeForDiscord for server name
        embed = new EmbedBuilder()
            .setTitle(`${escapeForDiscord(server.name)} is currently unavailable.`)
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
            .setTimestamp(Date.now())
            .setImage(CONFIG_VALUES.OFFLINE_SERVER_IMAGE);
    }

    return embed;
}

/**
 * Create a server list embed for public commands
 * @param {Object} serverData - The server data object
 * @returns {EmbedBuilder} - The Discord embed
 */
export function makeServerList(serverData) {
    // Create a server list embed for public commands
    const embed = new EmbedBuilder()
        .setTitle("Please specify what server you want to check.")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
        .setTimestamp(Date.now());

    // Generate the server list with proper escaping
    const list = Object.values(serverData)
        .map((server) => {
            const escapedName = escapeForDiscord(server.name);
            return server.online ? `${server.index}: **__${escapedName}__**: ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} on ${getWebsite(server.map)}` : `${server.index}: **__${escapedName}__**: is currently unavailable.`;
        })
        .join("\n");

    embed.setDescription(list);

    return embed;
}