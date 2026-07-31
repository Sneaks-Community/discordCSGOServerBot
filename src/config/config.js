/**
 * Configuration module - reads from validated environment variables
 * Builds a config object compatible with the previous config.json structure
 */

import { ACTIVITY_TYPE_BY_NAME, parseEnv } from "../schemas/envSchema.js";

const { errors, values: env, warnings } = parseEnv();

/**
 * Environment validation failures, in the order the variables are declared.
 * Reported and acted on by validateConfig(); non-empty means every value below
 * has fallen back to its default and must not be trusted.
 * @type {string[]}
 */
export const ENV_ERRORS = errors;

/**
 * Optional variables left empty, each naming the feature it disables.
 * Reported by validateConfig(); harmless, but worth saying out loud at startup.
 * @type {string[]}
 */
export const ENV_WARNINGS = warnings;

/**
 * Convert seconds to milliseconds
 * @param {number} seconds - Seconds
 * @returns {number} Milliseconds
 */
function toMs(seconds) {
    return seconds * 1000;
}

/**
 * Build the base configuration object from the validated environment.
 * Every value here has already been range-checked by envSchema, so consumers
 * can treat them as trusted: numbers are whole and in range, IDs are snowflakes
 * or empty, and URLs are absolute http(s).
 */
const baseConfig = {
    // The bot's presence. `type` is already the discord.js ActivityType, so the
    // name-to-type mapping lives in one place; empty `text` means show nothing.
    activity: {
        text: env.BOT_ACTIVITY_TEXT,
        type: ACTIVITY_TYPE_BY_NAME[env.BOT_ACTIVITY_TYPE]
    },
    cache: {
        userCacheTTLSeconds: env.USER_CACHE_TTL
    },
    database: {
        path: env.DATABASE_PATH
    },
    discord: {
        guildID: env.DISCORD_GUILD_ID,
        token: env.DISCORD_TOKEN
    },
    embeds: env.EMBEDS,
    embedsConfig: {
        color: env.EMBED_COLOR
    },
    fallback: {
        channelID: env.FALLBACK_CHANNEL_ID,
        guildID: env.FALLBACK_GUILD_ID
    },
    follows: {
        maxPerUser: env.MAX_FOLLOWS_PER_USER
    },
    gamedig: {
        defaultMaxRetries: env.GAMEDIG_MAX_RETRIES
    },
    images: {
        fallbackAvatar: env.FALLBACK_AVATAR_URL,
        offlineServer: env.OFFLINE_SERVER_IMAGE
    },
    mapImageBaseUrl: env.MAP_IMAGE_BASE_URL,
    notifications: {
        maxRecipientsPerEvent: env.MAX_NOTIFICATION_RECIPIENTS
    },
    rateLimit: {
        followPerMinute: env.RATE_LIMIT_FOLLOW_PER_MINUTE,
        notificationPerMinute: env.RATE_LIMIT_NOTIFICATION_PER_MINUTE,
        unfollowPerMinute: env.RATE_LIMIT_UNFOLLOW_PER_MINUTE
    },
    retry: {
        baseDelaySeconds: env.RETRY_BASE_DELAY,
        maxRetries: env.RETRY_MAX_RETRIES
    },
    security: {
        adminRoleId: env.ADMIN_ROLE_ID
    },
    serverUpdate: {
        intervalSeconds: env.SERVER_UPDATE_INTERVAL,
        maxConcurrentQueries: env.MAX_CONCURRENT_QUERIES
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
    MAX_CONCURRENT_SERVER_QUERIES: baseConfig.serverUpdate.maxConcurrentQueries,
    MAX_FOLLOWS_PER_USER: baseConfig.follows.maxPerUser,
    MAX_NOTIFICATION_RECIPIENTS: baseConfig.notifications.maxRecipientsPerEvent,
    NOTIFICATION_RATE_LIMIT_PER_MINUTE: baseConfig.rateLimit.notificationPerMinute,
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
