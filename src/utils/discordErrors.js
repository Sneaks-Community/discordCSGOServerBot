/**
 * Splits Discord failures into retryable and terminal, so a permanent condition
 * is not retried on backoff forever with only a generic failure in the log. Each
 * terminal code carries its remediation: these are setup mistakes or recipient
 * conditions, not runtime faults.
 */

import { RESTJSONErrorCodes } from "discord.js";

/**
 * Codes that cannot succeed on a retry, mapped to what to do about them.
 * @type {Map<number, string>}
 */
const TERMINAL_API_CODES = new Map([
    [RESTJSONErrorCodes.UnknownChannel, "Unknown Channel: the configured channel ID does not exist, or the bot is not in that guild"],
    [RESTJSONErrorCodes.UnknownMessage, "Unknown Message: that message no longer exists in the channel"],
    [RESTJSONErrorCodes.MissingAccess, "Missing Access: the bot cannot see that channel, grant it View Channel"],
    [RESTJSONErrorCodes.CannotEditMessageAuthoredByAnotherUser, "Cannot edit a message authored by another user: the tracked server list message was not posted by this bot, so clear the embed_message row and let it post a new one"],
    [RESTJSONErrorCodes.CannotSendMessagesToThisUser, "Cannot send messages to this user: their DMs are closed to the bot, or they have blocked it"],
    [RESTJSONErrorCodes.MissingPermissions, "Missing Permissions: the bot lacks a required permission in that channel"],
    [RESTJSONErrorCodes.CannotSendMessagesToThisUserDueToHavingNoMutualGuilds, "Cannot send messages to this user: the bot no longer shares a guild with them"]
]);

/**
 * A failure that will never succeed on a retry, raised by our own pre-checks
 * rather than by Discord. Carries its own remediation text.
 */
export class TerminalError extends Error {
    /**
     * @param {string} message - What failed
     * @param {string} [hint] - How to fix it; defaults to the message
     */
    constructor(message, hint) {
        super(message);
        this.name = "TerminalError";
        this.hint = hint ?? message;
    }
}

/**
 * @param {any} error - From a Discord call or one of our own pre-checks
 * @returns {string|null} - Remediation hint, or null when retryable
 */
export function getTerminalReason(error) {
    if (error instanceof TerminalError) {
        return error.hint;
    }

    // DiscordAPIError codes are numbers and node's own are strings, so a plain
    // lookup cannot confuse the two.
    return TERMINAL_API_CODES.get(error?.code) ?? null;
}

/**
 * The terminal codes describing the recipient rather than the request. Separate
 * because they are the only ones worth remembering: nothing the bot does helps
 * until the user reopens their DMs or rejoins.
 * @type {Set<number>}
 */
const RECIPIENT_REFUSAL_CODES = new Set([
    RESTJSONErrorCodes.CannotSendMessagesToThisUser,
    RESTJSONErrorCodes.CannotSendMessagesToThisUserDueToHavingNoMutualGuilds
]);

/**
 * Whether this recipient will refuse the next DM too.
 * @param {any} error
 * @returns {boolean}
 */
export function isRecipientRefusal(error) {
    return RECIPIENT_REFUSAL_CODES.has(error?.code);
}

/**
 * Retry predicate for withRetry at any Discord call site.
 * @param {any} error
 * @returns {boolean}
 */
export function isRetryableDiscordError(error) {
    return getTerminalReason(error) === null;
}
