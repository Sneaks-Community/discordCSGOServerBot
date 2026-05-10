/**
 * Player embed builders
 * Creates Discord embeds for player lists
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";
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
        embed = new EmbedBuilder()
            .setTitle(`${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} players connected to ${server.name} on ${server.map}`.replace(/_/g, "\\_"))
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
            .setTimestamp(Date.now());

        // Generate a list of player names
        let list = server.players.map((player) => player.name).join("\n");
        const botList = server.bots.map((bot) => bot.name).join("\n");
        list += botList;

        // Escape special characters for Discord and remove connecting players
        list = list
            .replace(/`/g, "'")
            .replace(/\*/g, "\\*")
            .replace(/_/g, "\\_")
            .replace(/undefined\n/g, "");

        embed.setDescription(list);
    } else {
        // Create an embed for the offline server
        embed = new EmbedBuilder()
            .setTitle(`${server.name} is currently unavailable.`)
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

    // Generate the server list
    const list = Object.values(serverData)
        .map((server) => {
            return server.online ? `${server.index}: **__${server.name}__**: ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} on ${getWebsite(server.map)}` : `${server.index}: **__${server.name}__**: is currently unavailable.`;
        })
        .join("\n");

    embed.setDescription(list);

    return embed;
}