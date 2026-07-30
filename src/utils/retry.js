/**
 * Retry logic with exponential backoff
 * Used for handling transient failures in async operations
 */

import { CONFIG_VALUES } from "../config/index.js";

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * At least one attempt is always made. The attempt count is clamped rather than
 * trusted because a `maxRetries` of 0 used to skip the loop body entirely and
 * return undefined, turning every caller (embed edits, fallback notifications)
 * into a silent no-op with nothing logged. envSchema now rejects
 * RETRY_MAX_RETRIES below 1, and the clamp here keeps direct callers safe too.
 * @param {Function} fn - The async function to execute
 * @param {Object} [options] - Retry behaviour overrides
 * @param {number} [options.baseDelay] - Base delay in milliseconds between retries
 * @param {Function} [options.isRetryable] - Predicate deciding whether an error is worth another attempt; defaults to retrying everything
 * @param {number} [options.maxRetries] - Total attempts to make, clamped to at least 1
 * @returns {Promise<any>} - The result of the function
 * @throws {any} - The error from the final attempt, or the first terminal error
 */
export async function withRetry(fn, options = {}) {
    const {
        baseDelay = CONFIG_VALUES.RETRY_BASE_DELAY_MS,
        isRetryable = () => true,
        maxRetries = CONFIG_VALUES.RETRY_MAX_RETRIES
    } = options;

    const requested = Number(maxRetries);
    const attempts = Number.isFinite(requested) ? Math.max(1, Math.trunc(requested)) : 1;

    let lastError;

    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            // A permanent failure (a deleted message, a missing permission) is thrown
            // straight back rather than retried on a growing delay, forever.
            if (i === attempts - 1 || !isRetryable(error)) break;
            // Equal jitter: half the backoff fixed, half random, so parallel retries
            // (one per configured embed) stop landing on the same tick.
            const backoff = baseDelay * 2 ** i;
            await new Promise(resolve => setTimeout(resolve, backoff / 2 + Math.random() * (backoff / 2)));
        }
    }

    // Reached only when every attempt threw, so lastError is always set. Rethrowing
    // here rather than inside the loop guarantees the function never resolves with
    // undefined on the failure path.
    throw lastError;
}