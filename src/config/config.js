/**
 * Configuration module - reads from environment variables
 * Builds a config object compatible with the previous config.json structure
 */

/**
 * Parse a comma-separated string into an array
 * @param {string} value - Comma-separated string
 * @returns {string[]} Array of trimmed values
 */
function parseArray(value) {
    if (!value || typeof value !== "string") return [];
    return value.split(",").map(s => s.trim()).filter(Boolean);
}

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
 * Parse a string to boolean
 * @param {string} value - String value
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Boolean value
 */
function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === "") return defaultValue;
    return value === "true" || value === "1";
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
    discord: {
        token: process.env.DISCORD_TOKEN || "",
        guildID: process.env.DISCORD_GUILD_ID || ""
    },
    security: {
        adminRoleId: process.env.ADMIN_ROLE_ID || ""
    },
    logging: {
        enabled: parseBoolean(process.env.LOGGING_ENABLED, true),
        guildID: process.env.LOG_GUILD_ID || "",
        channelID: process.env.LOG_CHANNEL_ID || ""
    },
    fallback: {
        guildID: process.env.FALLBACK_GUILD_ID || "",
        channelID: process.env.FALLBACK_CHANNEL_ID || ""
    },
    serverUpdate: {
        intervalSeconds: parseInt_(process.env.SERVER_UPDATE_INTERVAL, 90),
        mapCheckIntervalSeconds: parseInt_(process.env.MAP_CHECK_INTERVAL, 91),
        maxConcurrentQueries: parseInt_(process.env.MAX_CONCURRENT_QUERIES, 10)
    },
    follow: {
        timeoutSeconds: parseInt_(process.env.FOLLOW_TIMEOUT, 30)
    },
    embeds: parseJson(process.env.EMBEDS, []),
    cache: {
        userCacheTTLSeconds: parseInt_(process.env.USER_CACHE_TTL, 300),
        mapImageCacheTTLSeconds: parseInt_(process.env.MAP_IMAGE_CACHE_TTL, 86400)
    },
    retry: {
        maxRetries: parseInt_(process.env.RETRY_MAX_RETRIES, 3),
        baseDelaySeconds: parseInt_(process.env.RETRY_BASE_DELAY, 1)
    },
    gamedig: {
        defaultMaxRetries: parseInt_(process.env.GAMEDIG_MAX_RETRIES, 4)
    },
    embedsConfig: {
        color: parseInt_(process.env.EMBED_COLOR, 7980240)
    },
    images: {
        fallbackAvatar: process.env.FALLBACK_AVATAR_URL || "https://i.imgur.com/cBiDnMi.png",
        offlineServer: process.env.OFFLINE_SERVER_IMAGE || "https://i.imgur.com/WnS0Biz.png"
    },
    mapUrls: {
        surf: {
            stats: process.env.MAP_URLS_SURF_STATS || "https://snksrv.com/surfstats/",
            image: process.env.MAP_URLS_SURF_IMAGE || "https://bans.snksrv.com/images/maps/"
        },
        kz: {
            stats: process.env.MAP_URLS_KZ_STATS || "https://snksrv.com/kzstats/#/maps/",
            image: process.env.MAP_URLS_KZ_IMAGE || "https://raw.githubusercontent.com/KZGlobalTeam/map-images/public/images/"
        },
        bhop: {
            stats: process.env.MAP_URLS_BHOP_STATS || "https://snksrv.com/bhopstats/index.php?map=",
            image: process.env.MAP_URLS_BHOP_IMAGE || "https://bans.snksrv.com/images/maps/"
        }
    },
    rateLimit: {
        followPerMinute: parseInt_(process.env.RATE_LIMIT_FOLLOW_PER_MINUTE, 5),
        unfollowPerMinute: parseInt_(process.env.RATE_LIMIT_UNFOLLOW_PER_MINUTE, 5),
        ipCheckPerMinute: parseInt_(process.env.RATE_LIMIT_IP_CHECK_PER_MINUTE, 10)
    }
};

/**
 * Configuration values with milliseconds conversion
 */
export const CONFIG_VALUES = {
    EMBED_UPDATE_INTERVAL_MS: toMs(baseConfig.serverUpdate.intervalSeconds),
    MAP_CHECK_INTERVAL_MS: toMs(baseConfig.serverUpdate.mapCheckIntervalSeconds),
    MAP_FOLLOW_TIMEOUT_MS: toMs(baseConfig.follow.timeoutSeconds),
    MAX_CONCURRENT_SERVER_QUERIES: baseConfig.serverUpdate.maxConcurrentQueries,
    USER_CACHE_TTL: toMs(baseConfig.cache.userCacheTTLSeconds),
    MAP_IMAGE_CACHE_TTL: toMs(baseConfig.cache.mapImageCacheTTLSeconds),
    RETRY_MAX_RETRIES: baseConfig.retry.maxRetries,
    RETRY_BASE_DELAY_MS: toMs(baseConfig.retry.baseDelaySeconds),
    GAMEDIG_MAX_RETRIES: baseConfig.gamedig.defaultMaxRetries,
    EMBED_COLOR: baseConfig.embedsConfig.color,
    FALLBACK_AVATAR: baseConfig.images.fallbackAvatar,
    OFFLINE_SERVER_IMAGE: baseConfig.images.offlineServer,
    FOLLOW_RATE_LIMIT_PER_MINUTE: baseConfig.rateLimit.followPerMinute,
    UNFOLLOW_RATE_LIMIT_PER_MINUTE: baseConfig.rateLimit.unfollowPerMinute,
    IP_CHECK_RATE_LIMIT_PER_MINUTE: baseConfig.rateLimit.ipCheckPerMinute
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

/**
 * Validate required configuration values
 * @throws {Error} If required config is missing
 */
export function validateConfig() {
    if (!baseConfig.discord.token) {
        throw new Error("DISCORD_TOKEN is required");
    }
}

// Export the base config as the primary config
export const config = baseConfig;

export default config;
