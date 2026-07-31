/**
 * Button driven pagination for long embed listings.
 *
 * Listings that grow with real usage (every follow in the database, every map a
 * single user follows) will eventually exceed the 4096 character embed
 * description limit and fail the whole request. Rather than dropping rows, the
 * lines are split into pages and paged through with Discord's own message
 * components.
 *
 * The buttons are collected on the reply itself, so no global component router
 * is needed and nothing is persisted: after PAGE_IDLE_MS with no interaction the
 * collector ends and the buttons are disabled in place.
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from "discord.js";

import { createBaseEmbed } from "../embeds/baseEmbed.js";
import { commandLogger } from "./logger.js";
import { EMBED_DESCRIPTION_LIMIT } from "./truncate.js";

/** Stop listening after this long without a button press. */
const PAGE_IDLE_MS = 120_000;

/**
 * Hard stop for the collector. An interaction token is only valid for 15
 * minutes, after which the buttons cannot be disabled any more.
 */
const PAGE_MAX_MS = 14 * 60 * 1000;

/** Lines per page, so a page stays readable well before the character limit. */
const MAX_LINES_PER_PAGE = 20;

const PREV_ID = "page:prev";
const NEXT_ID = "page:next";
const COUNTER_ID = "page:counter";

/**
 * Split lines into page-sized description strings.
 * @param {string[]} lines - Lines to split
 * @param {Object} [options] - Options
 * @param {number} [options.limit] - Character limit per page
 * @param {number} [options.maxLines] - Line limit per page
 * @returns {string[]} One description string per page
 */
export function paginateLines(lines, { limit = EMBED_DESCRIPTION_LIMIT, maxLines = MAX_LINES_PER_PAGE } = {}) {
    const pages = [];
    let current = [];
    let used = 0;

    for (const rawLine of lines) {
        // A line longer than a whole page cannot be placed anywhere, so clamp it.
        const line = rawLine.length > limit ? rawLine.slice(0, limit) : rawLine;
        const cost = current.length === 0 ? line.length : line.length + 1;

        if (current.length > 0 && (current.length >= maxLines || used + cost > limit)) {
            pages.push(current.join("\n"));
            current = [line];
            used = line.length;
            continue;
        }

        current.push(line);
        used += cost;
    }

    if (current.length > 0) {
        pages.push(current.join("\n"));
    }

    return pages;
}

/**
 * Reply to an interaction with a listing, paginated if it does not fit one embed.
 *
 * A single page is sent as a plain embed with no components; only a genuine
 * overflow adds buttons.
 * @param {Object} interaction - Discord interaction object
 * @param {Object} options - Options
 * @param {boolean} [options.ephemeral] - Whether the reply is only visible to the invoker
 * @param {string[]} options.lines - The listing, one entry per line
 * @param {string} options.title - Embed title
 * @returns {Promise<void>}
 */
export async function replyWithPagedEmbed(interaction, { ephemeral = false, lines, title }) {
    // An embed description may not be empty, so an empty listing still needs a body.
    const pages = paginateLines(lines);
    if (pages.length === 0) {
        pages.push("*Nothing to show.*");
    }

    const flags = ephemeral ? MessageFlags.Ephemeral : 0;

    const buildEmbed = (index) => {
        // The footer is the page counter here, so the shared one is left off.
        const embed = createBaseEmbed(title, { footer: null })
            .setDescription(pages[index]);

        if (pages.length > 1) {
            embed.setFooter({ text: `Page ${index + 1} of ${pages.length}` });
        }
        return embed;
    };

    if (pages.length <= 1) {
        await interaction.reply({ embeds: [buildEmbed(0)], flags });
        return;
    }

    const buildRow = (index, disabled = false) => new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(PREV_ID)
            .setLabel("Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || index === 0),
        new ButtonBuilder()
            .setCustomId(COUNTER_ID)
            .setLabel(`${index + 1} / ${pages.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(NEXT_ID)
            .setLabel("Next")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || index === pages.length - 1)
    );

    let page = 0;
    const response = await interaction.reply({ components: [buildRow(page)], embeds: [buildEmbed(page)], flags });

    // Collecting on the interaction response matches on the interaction's own id,
    // so this works for ephemeral replies where there is no cached message.
    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        idle: PAGE_IDLE_MS,
        time: PAGE_MAX_MS
    });

    collector.on("collect", async (button) => {
        try {
            // Public listings are visible to everyone, but only the invoker drives them.
            if (button.user.id !== interaction.user.id) {
                await button.reply({ content: "Run the command yourself to page through the results.", flags: MessageFlags.Ephemeral });
                return;
            }

            page = button.customId === NEXT_ID
                ? Math.min(page + 1, pages.length - 1)
                : Math.max(page - 1, 0);

            await button.update({ components: [buildRow(page)], embeds: [buildEmbed(page)] });
        } catch (err) {
            commandLogger.warn({ err }, "Failed to turn page");
        }
    });

    // Leave the last page visible, but stop offering buttons that no longer respond.
    collector.on("end", () => {
        interaction.editReply({ components: [buildRow(page, true)] }).catch(() => {});
    });
}
