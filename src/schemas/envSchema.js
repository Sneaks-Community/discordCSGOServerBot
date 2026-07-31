/**
 * Environment variable validation: the single source of truth for what the bot
 * accepts from its environment.
 *
 * Every variable is declared exactly once here, together with its default, its
 * accepted range, and (when it is optional) a note on what leaving it empty
 * switches off. No other module reads process.env for a configuration value;
 * they read the shaped `config` object built from these values in
 * config/config.js.
 *
 * Validating up front matters because a bad value used to fail invisibly:
 * - `MAX_CONCURRENT_QUERIES=0` makes p-limit throw inside refresh(), which the
 *   embed loop catches, so the bot stayed up and never queried a server again.
 * - `RETRY_MAX_RETRIES=0` made withRetry() skip its loop body entirely and
 *   return undefined, so embed edits and fallback notifications became silent
 *   no-ops.
 * - A malformed `EMBEDS` value was swallowed by a try/catch and replaced with
 *   `[]`, so a JSON typo disabled the server list embed with no diagnostic.
 *
 * Rules that hold throughout:
 * - An unset or empty variable takes its documented default.
 * - An optional ID or URL may be empty to disable the feature it controls, but a
 *   non-empty value must be well formed. A typo is an operator error, not a
 *   reason to run half configured.
 * - Numbers must be whole and in range. `parseInt` used to accept "10s" as 10
 *   and negatives as-is; both are now rejected.
 *
 * Two deliberate exceptions, both in utils/logger.js:
 * - LOG_LEVEL's contract lives here as `logLevelSchema` but is applied there,
 *   because an unusable level must not stop the process: logging is how the
 *   problem gets reported. It degrades to DEFAULT_LOG_LEVEL with a warning.
 * - NODE_ENV is read there directly. It selects a log transport rather than
 *   configuring the bot, and any value is legitimate ("test", "staging"), so
 *   there is nothing to validate.
 */

import { ActivityType } from "discord.js";
import * as z from "zod";

import { formatZodPathSuffix } from "../utils/zodValidator.js";
import { discordIdSchema } from "./validationSchemas.js";

/**
 * Check that a string is an absolute http or https URL.
 * Used for the image URLs, which discord.js rejects at embed build time; an
 * invalid one would make every embed throw rather than fail visibly here.
 * @param {string} value - Candidate URL
 * @returns {boolean} - Whether the value is an http(s) URL
 */
function isHttpUrl(value) {
    let parsed;

    try {
        parsed = new URL(value);
    } catch {
        return false;
    }

    return parsed.protocol === "http:" || parsed.protocol === "https:";
}

/**
 * Build a schema for a whole-number variable, defaulted when unset or empty.
 * @param {number} defaultValue - Value used when the variable is unset or empty
 * @param {number} min - Smallest accepted value
 * @param {number} max - Largest accepted value
 * @returns {z.ZodType} - Schema producing a number
 */
function intEnv(defaultValue, min, max) {
    return z.preprocess(
        (value) => (value === undefined || String(value).trim() === "" ? String(defaultValue) : String(value).trim()),
        z
            .string()
            .regex(/^-?\d+$/, "must be a whole number")
            .transform(Number)
            .refine((parsed) => parsed >= min && parsed <= max, `must be between ${min} and ${max}`)
    );
}

/**
 * Build a schema for an optional Discord snowflake.
 * Empty means "feature disabled", which OPTIONAL_FEATURES turns into a startup
 * warning; a non-empty value has to be a real ID.
 * @returns {z.ZodType} - Schema producing a snowflake string or ""
 */
function optionalIdEnv() {
    return z.preprocess(
        (value) => (value === undefined ? "" : String(value).trim()),
        z
            .string()
            .refine(
                (value) => value === "" || discordIdSchema.safeParse(value).success,
                "must be a Discord ID (17-19 digits), or empty to disable the feature it controls"
            )
    );
}

/**
 * Build a schema for a required URL variable that falls back to a default.
 * @param {string} defaultValue - URL used when the variable is unset or empty
 * @returns {z.ZodType} - Schema producing an http(s) URL string
 */
function urlEnv(defaultValue) {
    return z.preprocess(
        (value) => (value === undefined || String(value).trim() === "" ? defaultValue : String(value).trim()),
        z.string().refine(isHttpUrl, "must be an http(s) URL")
    );
}

/**
 * Default base URL for map thumbnails.
 * Unlike the other image URLs this one distinguishes "unset" (use the default)
 * from "explicitly empty" (disable map images), which is why it cannot reuse
 * urlEnv.
 */
const MAP_IMAGE_BASE_URL_DEFAULT = "https://bans.snksrv.com/images/maps/";

/**
 * Base URL for map thumbnails, or "" to disable them.
 * The trailing slash is required because getMapImage concatenates directly.
 */
const mapImageBaseUrlEnv = z.preprocess(
    (value) => (value === undefined ? MAP_IMAGE_BASE_URL_DEFAULT : String(value).trim()),
    z
        .string()
        .refine(
            (value) => value === "" || (isHttpUrl(value) && value.endsWith("/")),
            "must be an http(s) URL ending in \"/\" (images are requested as <base><mapname>.jpg), or empty to disable map images"
        )
);

/**
 * BOT_ACTIVITY_TYPE values, mapped to the discord.js activity type each selects.
 * The accepted values below are derived from these keys, so this is the only list
 * to extend.
 *
 * `custom` renders the text verbatim; every other type has its verb prepended by
 * the client ("Playing ...", "Listening to ..."). Streaming is deliberately
 * absent: it only renders alongside a Twitch or YouTube URL, and this bot has
 * none to point at.
 */
export const ACTIVITY_TYPE_BY_NAME = Object.freeze({
    competing: ActivityType.Competing,
    custom: ActivityType.Custom,
    listening: ActivityType.Listening,
    playing: ActivityType.Playing,
    watching: ActivityType.Watching
});

/**
 * Accepted BOT_ACTIVITY_TYPE values, for validation and for error messages.
 * @type {string[]}
 */
export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_BY_NAME);

/**
 * Discord's limit on activity text, which applies to a custom status' state and
 * to every other type's name alike.
 */
const ACTIVITY_TEXT_MAX_LENGTH = 128;

/**
 * Presence text used when BOT_ACTIVITY_TEXT is unset. Names no channel on
 * purpose: where the commands are usable is the guild's decision, not the bot's.
 */
const ACTIVITY_TEXT_DEFAULT = "/follow <map> for map change alerts";

/**
 * BOT_ACTIVITY_TEXT: the presence text, or "" for no activity at all.
 * An over-long value is rejected rather than truncated, so a status that would
 * not display as written is visible as an operator error at startup.
 */
const activityTextEnv = z.preprocess(
    (value) => (value === undefined ? ACTIVITY_TEXT_DEFAULT : String(value).trim()),
    z.string().max(ACTIVITY_TEXT_MAX_LENGTH, `must be at most ${ACTIVITY_TEXT_MAX_LENGTH} characters (Discord's activity limit), or empty to show no activity`)
);

/**
 * One entry of the EMBEDS array: the message the bot keeps the server list in.
 */
const embedEntrySchema = z.object({
    channelID: z.string({ error: "is required and must be a string" }).pipe(discordIdSchema),
    messageID: z.string({ error: "is required and must be a string" }).pipe(discordIdSchema)
});

/**
 * EMBEDS: a JSON array of embed targets. Malformed JSON is an error rather than
 * an empty list, so a typo cannot quietly switch the embed feature off.
 */
const embedsEnv = z.preprocess(
    (value) => (value === undefined || String(value).trim() === "" ? "[]" : String(value)),
    z
        .string()
        .transform((value, ctx) => {
            try {
                return JSON.parse(value);
            } catch {
                ctx.addIssue({
                    code: "custom",
                    message: "must be valid JSON, for example [{\"channelID\":\"123456789012345678\",\"messageID\":\"123456789012345679\"}]"
                });
                return z.NEVER;
            }
        })
        .pipe(z.array(embedEntrySchema, { error: "must be a JSON array of {channelID, messageID} objects" }))
);

/**
 * Log levels pino accepts, least to most severe. Pino emits the standard numeric
 * levels itself (trace 10, debug 20, info 30, warn 40, error 50, fatal 60), so no
 * custom level formatter is needed.
 */
export const LOG_LEVELS = Object.freeze(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);

/**
 * Level used when LOG_LEVEL is unset, empty, or unrecognized.
 */
export const DEFAULT_LOG_LEVEL = "info";

/**
 * LOG_LEVEL, normalized to lowercase.
 * Kept out of envSchema on purpose: pino throws on an unrecognized level at
 * import time, before any logger exists to say why, so utils/logger.js applies
 * this schema and degrades to DEFAULT_LOG_LEVEL with a warning instead of
 * aborting startup.
 */
export const logLevelSchema = z.preprocess(
    (value) => (value === undefined || String(value).trim() === "" ? DEFAULT_LOG_LEVEL : String(value).trim().toLowerCase()),
    z.enum(LOG_LEVELS, { error: `must be one of: ${LOG_LEVELS.join(", ")}` })
);

/**
 * The full environment contract. Unknown variables are ignored, so the rest of
 * the process environment passes through untouched.
 */
export const envSchema = z.object({
    ADMIN_ROLE_ID: optionalIdEnv(),
    BOT_ACTIVITY_TEXT: activityTextEnv,
    BOT_ACTIVITY_TYPE: z.preprocess(
        (value) => (value === undefined || String(value).trim() === "" ? "custom" : String(value).trim().toLowerCase()),
        z.enum(ACTIVITY_TYPES, { error: `must be one of: ${ACTIVITY_TYPES.join(", ")}` })
    ),
    DATABASE_PATH: z.preprocess(
        (value) => (value === undefined || String(value).trim() === "" ? "db.sqlite" : String(value).trim()),
        z.string().min(1, "cannot be empty")
    ),
    // Required: it is the guild this instance serves, and the bot leaves any other
    // guild it is added to. Empty would leave the admin commands, which act on the
    // whole database, open to an Administrator of any guild the bot is in.
    DISCORD_GUILD_ID: z.preprocess(
        (value) => (value === undefined ? "" : String(value).trim()),
        z.string().refine(
            (value) => discordIdSchema.safeParse(value).success,
            "is required and must be a Discord ID (17-19 digits)"
        )
    ),
    // Trimmed because a pasted token often carries a trailing newline, which
    // Discord then rejects at login with an unhelpful message.
    DISCORD_TOKEN: z.preprocess(
        (value) => (value === undefined ? "" : String(value).trim()),
        z.string().min(1, "is required and must not be empty")
    ),
    // Discord takes a 24-bit RGB integer; anything wider makes EmbedBuilder throw
    EMBED_COLOR: intEnv(7980240, 0, 16777215),
    EMBEDS: embedsEnv,
    FALLBACK_AVATAR_URL: urlEnv("https://i.imgur.com/cBiDnMi.png"),
    FALLBACK_CHANNEL_ID: optionalIdEnv(),
    GAMEDIG_MAX_RETRIES: intEnv(4, 0, 10),
    MAP_IMAGE_BASE_URL: mapImageBaseUrlEnv,
    // p-limit throws on a concurrency below 1
    MAX_CONCURRENT_QUERIES: intEnv(10, 1, 100),
    // Lifetime cap per user. The per-minute rate limit only slows accumulation
    // down; without a ceiling one user can grow the table, their own /listfollows
    // and the notification fanout without bound.
    MAX_FOLLOWS_PER_USER: intEnv(50, 1, 10000),
    // Recipients notified per map change. Discord treats unsolicited bulk DMs as
    // spam and quarantines bots for it; every DM here is opt-in via /follow, and
    // this bounds how large a single fanout can get regardless.
    MAX_NOTIFICATION_RECIPIENTS: intEnv(200, 1, 10000),
    OFFLINE_SERVER_IMAGE: urlEnv("https://i.imgur.com/WnS0Biz.png"),
    RATE_LIMIT_FOLLOW_PER_MINUTE: intEnv(5, 1, 1000),
    // Ceiling on map-change DMs per user per minute. Repeats of one map are
    // collapsed separately, in notificationService, and never counted here.
    RATE_LIMIT_NOTIFICATION_PER_MINUTE: intEnv(10, 1, 1000),
    RATE_LIMIT_UNFOLLOW_PER_MINUTE: intEnv(5, 1, 1000),
    RETRY_BASE_DELAY: intEnv(1, 0, 60),
    // withRetry needs at least one attempt for its callback to ever run
    RETRY_MAX_RETRIES: intEnv(3, 1, 10),
    // A sub-30s interval would hammer every configured game server; 0 would busy-loop
    SERVER_UPDATE_INTERVAL: intEnv(90, 30, 86400),
    USER_CACHE_TTL: intEnv(300, 1, 86400)
});

/**
 * Optional variables and the feature each one switches off when left empty.
 * Empty is legal, so these produce startup warnings rather than errors. Listing
 * them beside the declarations above keeps "is this valid?" and "what does
 * skipping it cost?" in one file.
 */
const OPTIONAL_FEATURES = Object.freeze([
    { disables: "admin commands will be inaccessible", variable: "ADMIN_ROLE_ID" },
    { disables: "fallback notifications will be disabled", variable: "FALLBACK_CHANNEL_ID" },
    { disables: "server list embeds will not be updated", variable: "EMBEDS" }
]);

/**
 * Placeholders used only to materialize the schema's defaults after validation has
 * already failed. Every required variable needs one, or this parse throws in place of
 * reporting the operator's real mistakes. Never reach Discord: startup aborts before
 * login.
 */
const PLACEHOLDER_ENV = Object.freeze({
    DISCORD_GUILD_ID: "0".repeat(18),
    DISCORD_TOKEN: "unvalidated"
});

/**
 * Report optional variables that are set to nothing.
 * Both strings and the EMBEDS array answer to `.length`, so one check covers all.
 * @param {object} values - Validated environment values
 * @returns {string[]} - Warning messages
 */
function collectOptionalFeatureWarnings(values) {
    return OPTIONAL_FEATURES
        .filter(({ variable }) => values[variable].length === 0)
        .map(({ disables, variable }) => `${variable} is not set - ${disables}`);
}

/**
 * Render a Zod issue as a message prefixed with the variable it came from.
 * @param {import('zod').core.$ZodIssue} issue - Zod issue
 * @returns {string} - e.g. `EMBEDS[0].channelID: Discord ID must contain only digits`
 */
export function formatEnvIssue(issue) {
    const [name, ...rest] = issue.path;

    return `${String(name)}${formatZodPathSuffix(rest)}: ${issue.message}`;
}

/**
 * Validate the environment, collecting every failure rather than stopping at the
 * first, so one restart reports all of an operator's mistakes.
 * @param {Record<string, string|undefined>} [env] - Variables to validate
 * @returns {{ errors: string[], values: object, warnings: string[] }} - Failures, usable values, and disabled-feature notices
 */
export function parseEnv(env = process.env) {
    const result = envSchema.safeParse(env);

    if (result.success) {
        return { errors: [], values: result.data, warnings: collectOptionalFeatureWarnings(result.data) };
    }

    // Startup aborts whenever errors is non-empty, so these values are never read.
    // They exist only so that importing the config module cannot throw before
    // there is a logger available to report the real problem with. Warnings are
    // left empty because they would describe defaults, not the real configuration.
    return {
        errors: result.error.issues.map(formatEnvIssue),
        values: envSchema.parse(PLACEHOLDER_ENV),
        warnings: []
    };
}
