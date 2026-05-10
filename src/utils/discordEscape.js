/**
 * Escape all Discord markdown special characters in a string.
 * CRITICAL: Backslashes must be escaped FIRST to prevent injection attacks.
 * If we escape other characters first, a backslash could escape the escape character.
 * e.g., "\_" would become "\\\_" which is wrong — it should be "\\_"
 * @param {string} text - The text to escape
 * @returns {string} The escaped text
 */
export function escapeForDiscord(text) {
    if (typeof text !== "string") {
        return String(text ?? "");
    }

    // CRITICAL: Escape backslashes FIRST
    // If we escape other characters first, a backslash could escape the escape character
    // e.g., "\_" would become "\\\_" which is wrong — it should be "\\_"
    return text
        .replace(/\\/g, "\\\\")  // 1. Escape backslashes FIRST
        .replace(/_/g, "\\_")     // 2. Then escape underscores
        .replace(/\*/g, "\\*")    // 3. Then escape asterisks
        .replace(/~/g, "\\~")     // 4. Then escape tildes
        .replace(/`/g, "\\`");    // 5. Finally escape backticks
}

/**
 * Escape text for use in Discord embed titles.
 * Titles support bold, italic, underline, and other formatting.
 * @param {string} text - The text to escape
 * @returns {string} The escaped text
 */
export function escapeTitle(text) {
    return escapeForDiscord(text);
}

/**
 * Escape text for use in Discord embed descriptions and field values.
 * @param {string} text - The text to escape
 * @returns {string} The escaped text
 */
export function escapeDescription(text) {
    return escapeForDiscord(text);
}

/**
 * Escape a list of items (e.g., player names) for Discord embed description.
 * Filters out empty, undefined, and null values.
 * @param {string[]} items - Array of strings to escape and join
 * @returns {string} Escaped and joined string
 */
export function escapeList(items) {
    return items
        .map((item) => escapeForDiscord(item))
        .filter((item) => item && item !== "undefined" && item !== "null")
        .join("\n");
}
