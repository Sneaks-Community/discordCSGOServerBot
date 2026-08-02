import { CONFIG_VALUES } from "../config/index.js";
import { escapeForDiscord } from "../utils/discordEscape.js";
import { createBaseEmbed } from "./baseEmbed.js";

/**
 * Describe an interval in words, e.g. "45 seconds", "1.5 minutes". Minutes keep
 * one decimal so the default 90s does not read as "2 minutes".
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
 * @param {object} serverData - The full serverService snapshot
 * @returns {import('discord.js').EmbedBuilder}
 */
export function makeEmbed(serverData) {
    const embed = createBaseEmbed("Server List")
        .setDescription(`This list is updated every ${describeInterval(CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS)}.`);

    for (const server of Object.values(serverData)) {
        if (!server.online) {
            embed.addFields({
                inline: true,
                name: escapeForDiscord(server.name),
                value: "**Server is not available.**"
            });
            continue;
        }

        embed.addFields({
            inline: true,
            name: escapeForDiscord(server.name),
            value: `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}\n**__Map:__** ${escapeForDiscord(server.map)}\n**__IP:__** ${escapeForDiscord(server.fullIP)}`
        });
    }

    return embed;
}