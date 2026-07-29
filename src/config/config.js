/**
 * Configuration module - reads from environment variables
 * Builds a config object compatible with the previous config.json structure
 */

/**
 * Parse a JSON string into an object/array
 * @param {string} value - JSON string
 * @param {object|array} defaultValue - Default value if parsing fails
 * @returns {object|array} Parsed value or default
 */
function parseJson(value, defaultValue) {
    if (!value || typeof value !== "string") return defaultValue;
    try {
        return JSON.parse(value);
    } catch {
        return defaultValue;
    }
}

/**
 * Parse a string to integer
 * @param {string} value - String value
 * @param {number} defaultValue - Default value
 * @returns {number} Integer value
 */
function parseInt_(value, defaultValue) {
    if (value === undefined || value === null || value === "") return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Convert seconds to milliseconds
 * @param {number} seconds - Seconds
 * @returns {number} Milliseconds
 */
function toMs(seconds) {
    return seconds * 1000;
}

/**
 * Build the base configuration object from environment variables
 */
const baseConfig = {
    cache: {
        userCacheTTLSeconds: parseInt_(process.env.USER_CACHE_TTL, 300)
    },
    discord: {
        guildID: process.env.DISCORD_GUILD_ID || "",
        token: process.env.DISCORD_TOKEN || ""
    },
    embeds: parseJson(process.env.EMBEDS, []),
    embedsConfig: {
        color: parseInt_(process.env.EMBED_COLOR, 7980240)
    },
    fallback: {
        channelID: process.env.FALLBACK_CHANNEL_ID || "",
        guildID: process.env.FALLBACK_GUILD_ID || ""
    },
    gamedig: {
        defaultMaxRetries: parseInt_(process.env.GAMEDIG_MAX_RETRIES, 4)
    },
    images: {
        fallbackAvatar: process.env.FALLBACK_AVATAR_URL || "https://i.imgur.com/cBiDnMi.png",
        offlineServer: process.env.OFFLINE_SERVER_IMAGE || "https://i.imgur.com/WnS0Biz.png"
    },
    mapImageBaseUrl: process.env.MAP_IMAGE_BASE_URL ?? "https://bans.snksrv.com/images/maps/",
    rateLimit: {
        followPerMinute: parseInt_(process.env.RATE_LIMIT_FOLLOW_PER_MINUTE, 5),
        ipCheckPerMinute: parseInt_(process.env.RATE_LIMIT_IP_CHECK_PER_MINUTE, 10),
        unfollowPerMinute: parseInt_(process.env.RATE_LIMIT_UNFOLLOW_PER_MINUTE, 5)
    },
    retry: {
        baseDelaySeconds: parseInt_(process.env.RETRY_BASE_DELAY, 1),
        maxRetries: parseInt_(process.env.RETRY_MAX_RETRIES, 3)
    },
    security: {
        adminRoleId: process.env.ADMIN_ROLE_ID || ""
    },
    serverUpdate: {
        defaultPort: parseInt_(process.env.SERVER_DEFAULT_PORT, 27015),
        intervalSeconds: parseInt_(process.env.SERVER_UPDATE_INTERVAL, 90),
        mapCheckIntervalSeconds: parseInt_(process.env.MAP_CHECK_INTERVAL, 91),
        maxConcurrentQueries: parseInt_(process.env.MAX_CONCURRENT_QUERIES, 10)
    }
};

/**
 * Configuration values with milliseconds conversion
 */
export const CONFIG_VALUES = {
    EMBED_COLOR: baseConfig.embedsConfig.color,
    EMBED_UPDATE_INTERVAL_MS: toMs(baseConfig.serverUpdate.intervalSeconds),
    FALLBACK_AVATAR: baseConfig.images.fallbackAvatar,
    FOLLOW_RATE_LIMIT_PER_MINUTE: baseConfig.rateLimit.followPerMinute,
    GAMEDIG_MAX_RETRIES: baseConfig.gamedig.defaultMaxRetries,
    IP_CHECK_RATE_LIMIT_PER_MINUTE: baseConfig.rateLimit.ipCheckPerMinute,
    MAP_CHECK_INTERVAL_MS: toMs(baseConfig.serverUpdate.mapCheckIntervalSeconds),
    MAX_CONCURRENT_SERVER_QUERIES: baseConfig.serverUpdate.maxConcurrentQueries,
    OFFLINE_SERVER_IMAGE: baseConfig.images.offlineServer,
    RETRY_BASE_DELAY_MS: toMs(baseConfig.retry.baseDelaySeconds),
    RETRY_MAX_RETRIES: baseConfig.retry.maxRetries,
    UNFOLLOW_RATE_LIMIT_PER_MINUTE: baseConfig.rateLimit.unfollowPerMinute,
    USER_CACHE_TTL: toMs(baseConfig.cache.userCacheTTLSeconds)
};

/**
 * Required permissions for bot operations
 */
export const REQUIRED_PERMISSIONS = {
    EMBED_LINKS: "EmbedLinks",
    READ_MESSAGE_HISTORY: "ReadMessageHistory",
    SEND_MESSAGES: "SendMessages",
    VIEW_CHANNEL: "ViewChannel"
};

// Export the base config as the primary config
export const config = baseConfig;

export default config;
