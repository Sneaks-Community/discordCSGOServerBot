import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";

const LAST_UPDATED_FOOTER = { iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" };

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
