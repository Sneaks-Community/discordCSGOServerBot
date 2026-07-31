/**
 * Cache and rate limiting service
 * Handles user caching and rate limit tracking
 */

import { CONFIG_VALUES } from "../config/index.js";
import { serviceLogger } from "../utils/logger.js";

// User cache for reducing API calls
const userCache = new Map();

// Rate limiting tracking - stores timestamp arrays per user/command
const userActionRateLimits = new Map();

// Maximum cache sizes to prevent memory leaks
const MAX_USER_CACHE_SIZE = 1000;
const MAX_RATE_LIMIT_MAP_SIZE = 5000;

/**
 * Get a cached user or fetch from Discord API
 * @param {string} userId - The Discord user ID
 * @param {Object} bot - The Discord bot client
 * @returns {Promise<Object>} - The user object
 */
export async function getCachedUser(userId, bot) {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CONFIG_VALUES.USER_CACHE_TTL) {
        return cached.user;
    }
    
    // Enforce maximum cache size with LRU eviction
    if (userCache.size >= MAX_USER_CACHE_SIZE) {
        // Find and remove the oldest entry
        let oldestKey = null;
        let oldestTimestamp = Infinity;
        for (const [key, value] of userCache.entries()) {
            if (value.timestamp < oldestTimestamp) {
                oldestTimestamp = value.timestamp;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            userCache.delete(oldestKey);
        }
    }
    
    const user = await bot.users.fetch(userId);
    userCache.set(userId, { timestamp: Date.now(), user });
    return user;
}

/**
 * Clear expired entries from user cache
 */
function cleanupUserCache() {
    if (userCache.size === 0) return;
    
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp > CONFIG_VALUES.USER_CACHE_TTL) {
            userCache.delete(key);
            cleaned++;
        }
    }
    
    // If cache is still over limit after TTL cleanup, evict oldest entries
    if (userCache.size >= MAX_USER_CACHE_SIZE) {
        const entries = [...userCache.entries()]
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toDelete = entries.slice(0, userCache.size - MAX_USER_CACHE_SIZE + 1);
        for (const [key] of toDelete) {
            userCache.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        serviceLogger.info(`User cache cleanup: removed ${cleaned} entries, current size: ${userCache.size}`);
    }
}

/**
 * Check if a user has exceeded their rate limit for a specific action
 * @param {string} userId - The Discord user ID
 * @param {string} action - The action type (follow, unfollow, etc.)
 * @param {number} limit - Maximum actions allowed per minute
 * @returns {Object} - { allowed: boolean, retryAfter: number }
 */
export function checkRateLimit(userId, action, limit) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Initialize or get existing action history for user
    if (!userActionRateLimits.has(userId)) {
        userActionRateLimits.set(userId, {});
    }
    
    const userActions = userActionRateLimits.get(userId);
    
    if (!userActions[action]) {
        userActions[action] = [];
    }
    
    // Filter out actions older than 1 minute
    userActions[action] = userActions[action].filter(timestamp => timestamp > oneMinuteAgo);
    
    // Check if limit exceeded
    if (userActions[action].length >= limit) {
        const oldestAction = userActions[action][0];
        const retryAfter = Math.ceil((oldestAction + 60000 - now) / 1000);
        return { allowed: false, retryAfter };
    }
    
    // Record this action
    userActions[action].push(now);
    return { allowed: true, retryAfter: 0 };
}

/**
 * Clear rate limit map periodically to prevent memory leaks
 */
function cleanupRateLimits() {
    if (userActionRateLimits.size === 0) return;
    
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userId, actions] of userActionRateLimits.entries()) {
        let hasValidActions = false;
        for (const action of Object.keys(actions)) {
            actions[action] = actions[action].filter(ts => now - ts < 60000);
            if (actions[action].length === 0) {
                delete actions[action];
            } else {
                hasValidActions = true;
            }
        }
        if (!hasValidActions) {
            userActionRateLimits.delete(userId);
            cleaned++;
        }
    }
    
    // Enforce maximum size with LRU eviction if still over limit
    if (userActionRateLimits.size >= MAX_RATE_LIMIT_MAP_SIZE) {
        // Find users with oldest action timestamps
        const userTimestamps = [];
        for (const [userId, actions] of userActionRateLimits.entries()) {
            let oldestTs = Infinity;
            for (const action of Object.keys(actions)) {
                if (actions[action].length > 0) {
                    oldestTs = Math.min(oldestTs, actions[action][0]);
                }
            }
            if (oldestTs !== Infinity) {
                userTimestamps.push({ oldestTs, userId });
            }
        }
        
        // Sort by oldest timestamp and remove oldest users
        userTimestamps.sort((a, b) => a.oldestTs - b.oldestTs);
        const toDelete = userTimestamps.slice(0, userActionRateLimits.size - MAX_RATE_LIMIT_MAP_SIZE + 100);
        for (const { userId } of toDelete) {
            userActionRateLimits.delete(userId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        serviceLogger.info(`Rate limit cleanup: removed ${cleaned} users, current size: ${userActionRateLimits.size}`);
    }
}

/**
 * Store cleanup interval references for proper shutdown
 * @type {NodeJS.Timeout[]}
 */
let cleanupIntervalRefs = [];

/**
 * Start cleanup intervals for cache and rate limits.
 * The handles stay module-private; clearCleanupIntervals is what cancels them.
 */
export function startCleanupIntervals() {
    cleanupIntervalRefs.push(setInterval(cleanupUserCache, 300000)); // 5 minutes
    cleanupIntervalRefs.push(setInterval(cleanupRateLimits, 300000)); // 5 minutes
}

/**
 * Clear all cleanup intervals
 */
export function clearCleanupIntervals() {
    cleanupIntervalRefs.forEach(id => clearInterval(id));
    cleanupIntervalRefs = [];
}
