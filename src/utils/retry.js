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
 * @param {number} maxRetries - Total attempts to make, clamped to at least 1
 * @param {number} baseDelay - Base delay in milliseconds between retries
 * @returns {Promise<any>} - The result of the function
 * @throws {any} - The error from the final attempt, if every attempt failed
 */
export async function withRetry(fn, maxRetries = CONFIG_VALUES.RETRY_MAX_RETRIES, baseDelay = CONFIG_VALUES.RETRY_BASE_DELAY_MS) {
    const requested = Number(maxRetries);
    const attempts = Number.isFinite(requested) ? Math.max(1, Math.trunc(requested)) : 1;

    let lastError;

    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (i === attempts - 1) break;
            const delay = baseDelay * 2 ** i;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // Reached only when every attempt threw, so lastError is always set. Rethrowing
    // here rather than inside the loop guarantees the function never resolves with
    // undefined on the failure path.
    throw lastError;
}