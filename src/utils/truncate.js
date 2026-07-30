/**
 * Output size helpers for Discord's hard payload limits.
 *
 * Discord rejects the entire request with an HTTP 400 when an embed description
 * exceeds 4096 characters or message content exceeds 2000, which surfaces to the
 * user as the generic "An error occurred" reply. Any listing whose length grows
 * with real usage has to be bounded before it is sent.
 */

/** Maximum length of a single embed description. */
export const EMBED_DESCRIPTION_LIMIT = 4096;

/** Maximum length of plain message content. */
export const MESSAGE_CONTENT_LIMIT = 2000;

/**
 * Default overflow notice appended when lines had to be dropped.
 * @param {number} remaining - Number of lines that did not fit
 * @returns {string} The notice, including its leading newline
 */
function defaultSuffix(remaining) {
    return `\n...and ${remaining} more`;
}

/**
 * Join lines, stopping before `limit` and reporting what was left out.
 *
 * Non-strings and empty strings are dropped first, so callers can pass a raw
 * mapped array. The worst case notice length is reserved up front, which means
 * the notice itself can never push the result back over the limit.
 * @param {string[]} lines - Lines to join
 * @param {number} limit - Maximum length of the returned string
 * @param {Object} [options] - Options
 * @param {string} [options.separator] - Separator between lines, default newline
 * @param {Function} [options.suffix] - Builds the overflow notice from a remaining count
 * @returns {string} The joined text, never longer than `limit`
 */
export function joinWithinLimit(lines, limit, { separator = "\n", suffix = defaultSuffix } = {}) {
    const items = lines.filter((line) => typeof line === "string" && line.length > 0);
    if (items.length === 0) {
        return "";
    }

    const joined = items.join(separator);
    if (joined.length <= limit) {
        return joined;
    }

    const budget = limit - suffix(items.length).length;

    const kept = [];
    let used = 0;
    for (const item of items) {
        const cost = kept.length === 0 ? item.length : item.length + separator.length;
        if (used + cost > budget) {
            break;
        }
        kept.push(item);
        used += cost;
    }

    // Not even the first line fits, so hard-truncate it rather than returning an
    // empty description. The final slice is the invariant: whatever the caller's
    // suffix does, the result is never longer than the limit.
    if (kept.length === 0) {
        const notice = items.length > 1 ? suffix(items.length - 1) : "";
        const head = items[0].slice(0, Math.max(0, limit - notice.length - 1));
        return (head + "…" + notice).slice(0, limit);
    }

    return (kept.join(separator) + suffix(items.length - kept.length)).slice(0, limit);
}
