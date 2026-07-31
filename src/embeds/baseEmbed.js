/**
 * Shared embed scaffolding
 * Applies the colour, footer and timestamp every embed in the bot carries
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES } from "../config/index.js";

/**
 * The footer almost every embed wants, next to the timestamp set below it.
 */
const LAST_UPDATED_FOOTER = { iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" };

/**
 * Create an embed with the bot's colour, footer and timestamp already applied.
 *
 * Pass `footer: null` for the embeds that are not a snapshot of anything (/help)
 * or that need the footer for something else (a paginated listing puts its page
 * counter there).
 * @param {string} title - The embed title
 * @param {Object} [options] - Options
 * @param {?Object} [options.footer] - Footer payload, or null for no footer
 * @returns {EmbedBuilder} - The embed, ready for a description or fields
 */
export function createBaseEmbed(title, { footer = LAST_UPDATED_FOOTER } = {}) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now());

    if (footer) embed.setFooter(footer);

    return embed;
}
