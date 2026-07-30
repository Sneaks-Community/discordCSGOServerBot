/**
 * Classification of Discord failures into retryable and terminal.
 *
 * Retrying a permanent condition is worse than useless: the embed loop used to
 * retry "Unknown Message" three times with backoff every 90 seconds forever, and
 * the real cause never appeared in the logs as anything but a generic failure.
 * Each terminal code below carries the remediation, because these are setup
 * mistakes or per-recipient conditions rather than runtime faults.
 */

import { RESTJSONErrorCodes } from "discord.js";

/**
 * DiscordAPIError codes that cannot succeed on a retry, mapped to what to do.
 * The last two are per-recipient conditions on a DM rather than setup mistakes:
 * the user has to reopen their DMs or rejoin, so nothing the bot does helps.
 * @type {Map<number, string>}
 */
const TERMINAL_API_CODES = new Map([
    [RESTJSONErrorCodes.UnknownChannel, "Unknown Channel: the configured channel ID does not exist, or the bot is not in that guild"],
    [RESTJSONErrorCodes.UnknownMessage, "Unknown Message: the configured message ID does not exist in that channel"],
    [RESTJSONErrorCodes.MissingAccess, "Missing Access: the bot cannot see that channel, grant it View Channel"],
    [RESTJSONErrorCodes.CannotEditMessageAuthoredByAnotherUser, "Cannot edit a message authored by another user: the message referenced by EMBEDS must have been posted by the bot itself, so post a new one as the bot and use its ID"],
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
 * Describe why an error is terminal, if it is.
 * @param {any} error - Error from a Discord call or a pre-check
 * @returns {string|null} - Remediation hint, or null when the error is retryable
 */
export function getTerminalReason(error) {
    if (error instanceof TerminalError) {
        return error.hint;
    }

    // DiscordAPIError exposes the API error code as a number; node's own errors
    // use string codes, so there is nothing to disambiguate.
    return TERMINAL_API_CODES.get(error?.code) ?? null;
}

/**
 * Retry predicate for withRetry at any Discord call site.
 * @param {any} error - Error thrown by the attempt
 * @returns {boolean} - Whether another attempt could plausibly succeed
 */
export function isRetryableDiscordError(error) {
    return getTerminalReason(error) === null;
}
