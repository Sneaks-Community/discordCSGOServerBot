/**
 * Application constants and configuration values
 * Derived from config.json with defaults
 */

import config from "../../config.json" with { type: "json" };

// Helper function to convert seconds to milliseconds
function secondsToMilliseconds(seconds) {
    return seconds * 1000;
}

// Configuration values - using seconds for better readability, converting to milliseconds where needed
export const CONFIG_VALUES = {
    EMBED_UPDATE_INTERVAL_MS: secondsToMilliseconds(config.serverUpdate?.intervalSeconds || 90),
    MAP_CHECK_INTERVAL_MS: secondsToMilliseconds(config.serverUpdate?.mapCheckIntervalSeconds || 91),
    MAP_FOLLOW_TIMEOUT_MS: secondsToMilliseconds(config.follow?.timeoutSeconds || 30),
    MAX_CONCURRENT_SERVER_QUERIES: config.serverUpdate?.maxConcurrentQueries || 10,
    USER_CACHE_TTL: secondsToMilliseconds(config.cache?.userCacheTTLSeconds || 300),
    MAP_IMAGE_CACHE_TTL: secondsToMilliseconds(config.cache?.mapImageCacheTTLSeconds || 86400),
    RETRY_MAX_RETRIES: config.retry?.maxRetries || 3,
    RETRY_BASE_DELAY_MS: secondsToMilliseconds(config.retry?.baseDelaySeconds || 1),
    GAMEDIG_MAX_RETRIES: config.gamedig?.defaultMaxRetries || 4,
    EMBED_COLOR: config.embedsConfig?.color || 7980240,
    FALLBACK_AVATAR: config.images?.fallbackAvatar || "https://i.imgur.com/cBiDnMi.png",
    OFFLINE_SERVER_IMAGE: config.images?.offlineServer || "https://i.imgur.com/WnS0Biz.png",
    // Rate limiting configuration
    FOLLOW_RATE_LIMIT_PER_MINUTE: config.rateLimit?.followPerMinute || 5,
    UNFOLLOW_RATE_LIMIT_PER_MINUTE: config.rateLimit?.unfollowPerMinute || 5,
    IP_CHECK_RATE_LIMIT_PER_MINUTE: config.rateLimit?.ipCheckPerMinute || 10
};

/**
 * Required permissions for bot operations
 */
export const REQUIRED_PERMISSIONS = {
    SEND_MESSAGES: "SendMessages",
    EMBED_LINKS: "EmbedLinks",
    READ_MESSAGE_HISTORY: "ReadMessageHistory",
    VIEW_CHANNEL: "ViewChannel"
};

// Export config for direct access if needed
export { config };