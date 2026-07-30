import { escapeMarkdown } from "discord.js";

/**
 * Markdown constructs to neutralize in untrusted text.
 *
 * The defaults already cover code blocks, inline code, bold, italic, underline,
 * strikethrough, spoilers and backslashes (backslashes first, so an attacker cannot
 * escape our escape character). The four enabled below are off by default and all
 * matter here, because player names are rendered at the start of a line inside embed
 * descriptions:
 * - maskedLink: stops `[Free skins](https://evil.example)` rendering as a clickable
 *   link that hides its real destination
 * - heading / bulletedList / numberedList: stop a name from restyling the list it
 *   appears in
 */
const ESCAPE_OPTIONS = {
    bulletedList: true,
    heading: true,
    maskedLink: true,
    numberedList: true
};

/**
 * Escape Discord markdown in untrusted text (player names, map names, server data).
 *
 * Delegates to discord.js's escapeMarkdown rather than hand-rolling replacements, so
 * the pattern list stays current with Discord's renderer. Note it escapes masked
 * links by pattern, so ordinary parentheses in a name ("Bob (AFK)") are left intact.
 * @param {string} text - The text to escape
 * @returns {string} The escaped text
 */
export function escapeForDiscord(text) {
    if (typeof text !== "string") {
        return String(text ?? "");
    }

    return escapeMarkdown(text, ESCAPE_OPTIONS);
}

/**
 * Escape a list of items (e.g., player names) for rendering.
 * Filters out empty, undefined, and null values.
 * @param {string[]} items - Array of strings to escape
 * @returns {string[]} Escaped, non-empty items
 */
export function escapeLines(items) {
    return items
        .map((item) => escapeForDiscord(item))
        .filter((item) => item && item !== "undefined" && item !== "null");
}

/**
 * Escape a list of items (e.g., player names) for Discord embed description.
 * Filters out empty, undefined, and null values.
 *
 * Callers that render into a length-limited field should use escapeLines with
 * joinWithinLimit instead, so the result can be bounded line by line.
 * @param {string[]} items - Array of strings to escape and join
 * @returns {string} Escaped and joined string
 */
export function escapeList(items) {
    return escapeLines(items).join("\n");
}
