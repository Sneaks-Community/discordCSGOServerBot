/**
 * Retry logic with exponential backoff
 * Used for handling transient failures in async operations
 */

import { CONFIG_VALUES } from "../config/index.js";

/**
 * Execute a function with retry logic and exponential backoff
 * @param {Function} fn - The async function to execute
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelay - Base delay in milliseconds between retries
 * @returns {Promise<any>} - The result of the function
 */
export async function withRetry(fn, maxRetries = CONFIG_VALUES.RETRY_MAX_RETRIES, baseDelay = CONFIG_VALUES.RETRY_BASE_DELAY_MS) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = baseDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}