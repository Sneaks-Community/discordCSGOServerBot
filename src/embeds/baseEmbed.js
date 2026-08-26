import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";

const LAST_UPDATED_FOOTER = { iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" };

/**
 * The bots-in-parentheses convention, in one place so the four call sites
 * cannot drift apart. Each field falls back on its own because /testnotify
 * passes a server that has no counts.
 * @param {object} [server] - One entry from the serverService snapshot
 * @returns {string} - e.g. "12 (2) / 24"
 */
export function formatPlayerCounts(server) {
    return `${server?.numPlayers ?? "unknown"} (${server?.numBots ?? "unknown"}) / ${server?.maxPlayers ?? "unknown"}`;
}

/**
 * Applies the bot's colour, footer and timestamp. Pass `footer: null` for
 * embeds that are not a snapshot (/help) or that reuse the footer (pagination).
 * @param {string} title
 * @param {object} [options]
 * @param {?object} [options.footer] - Footer payload, or null for no footer
 * @returns {import('discord.js').EmbedBuilder}
 */
export function createBaseEmbed(title, { footer = LAST_UPDATED_FOOTER } = {}) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now());

    if (footer) embed.setFooter(footer);

    return embed;
}
