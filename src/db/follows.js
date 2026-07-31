/**
 * Database follow operations
 * Handles all follow/unfollow database operations
 *
 * Uses Zod v4 schemas for validation and parameterized queries for SQL injection prevention.
 */

import { discordIdSchema, mapNameSchema } from "../schemas/validationSchemas.js";
import { dbLogger } from "../utils/logger.js";
import { validateWithZod } from "../utils/zodValidator.js";
import { getStatement } from "./connection.js";

/**
 * Helper to validate and execute database operations using Zod v4 schemas
 * @param {z.ZodType} schema - Zod v4 schema to validate against
 * @param {any} value - Value to validate
 * @param {string} operationName - Name of the operation for error messages
 * @returns {any} Validated and transformed value
 */
function validateOrThrow(schema, value, operationName) {
    const result = validateWithZod(schema, value, operationName);
    if (!result.valid) {
        throw new Error(result.error);
    }
    return result.data;
}

/**
 * Run a statement with error handling, reusing a cached prepared statement
 * @param {string} sql - SQL statement
 * @param {Array} params - Parameters for the statement
 * @param {string} operationName - Name of the operation for error logging
 * @param {"all" | "get" | "run"} mode - better-sqlite3 method to invoke
 * @returns {any} Result of the operation
 */
function runStatement(sql, params, operationName, mode) {
    const stmt = getStatement(sql);
    try {
        return stmt[mode](...params);
    } catch (err) {
        dbLogger.error({ err, operation: operationName }, "Database error");
        throw err;
    }
}

/**
 * Follow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to follow
 */
export function followMap(discord_id, map_name) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "followMap/discord_id");
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "followMap/map_name");
    // Columns are named rather than positional so that adding one later cannot
    // silently shift these two values into the wrong places.
    runStatement("INSERT INTO players_follow (discord_id, map_name) VALUES (?, ?)", [validatedDiscordId, validatedMapName], "followMap", "run");
}

/**
 * Unfollow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to unfollow
 */
export function unfollowMap(discord_id, map_name) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "unfollowMap/discord_id");
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "unfollowMap/map_name");
    runStatement("DELETE FROM players_follow WHERE discord_id = ? AND map_name = ?", [validatedDiscordId, validatedMapName], "unfollowMap", "run");
}

/**
 * Get all follows from the database, grouped by user.
 *
 * Ordered here rather than by the caller: UNIQUE(discord_id, map_name) already covers
 * both columns, so SQLite reads the rows out in this order instead of sorting them.
 * @returns {Array} - Array of all rows from players_follow, ordered by user then map
 */
export function getAllFollows() {
    return runStatement("SELECT discord_id, map_name FROM players_follow ORDER BY discord_id, map_name", [], "getAllFollows", "all");
}

/**
 * Get maps followed by a user
 * @param {string} discord_id - The Discord user ID
 * @returns {Array} - Array of objects with map_name property
 */
export function getUserFollows(discord_id) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "getUserFollows/discord_id");
    return runStatement("SELECT map_name FROM players_follow WHERE discord_id = ?", [validatedDiscordId], "getUserFollows", "all");
}

/**
 * Count the maps a user follows
 * @param {string} discord_id - The Discord user ID
 * @returns {number} - Number of maps the user follows
 */
export function countUserFollows(discord_id) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "countUserFollows/discord_id");
    const row = runStatement("SELECT COUNT(*) AS count FROM players_follow WHERE discord_id = ?", [validatedDiscordId], "countUserFollows", "get");
    return row?.count ?? 0;
}

/**
 * Check if a user is following a specific map
 *
 * Selects a constant rather than columns and answers with a boolean: nothing
 * reads a field off the row, only whether one exists. `.get()` yields undefined
 * when it does not, which is what the comparison turns into `false`.
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name
 * @returns {boolean} - Whether the user follows the map
 */
export function isFollowingMap(discord_id, map_name) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "isFollowingMap/discord_id");
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "isFollowingMap/map_name");
    const row = runStatement("SELECT 1 FROM players_follow WHERE discord_id = ? AND map_name = ?", [validatedDiscordId, validatedMapName], "isFollowingMap", "get");
    return row !== undefined;
}

/**
 * Get users following a specific map
 * @param {string} map_name - The map name
 * @returns {Array} - Array of objects with discord_id property
 */
export function getUsersFollowingMap(map_name) {
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "getUsersFollowingMap/map_name");
    return runStatement("SELECT discord_id FROM players_follow WHERE map_name = ?", [validatedMapName], "getUsersFollowingMap", "all");
}

/**
 * Check if any user is following a specific map
 *
 * As with isFollowingMap, only the presence of a row matters.
 * @param {string} map_name - The map name
 * @returns {boolean} - Whether at least one user follows the map
 */
export function hasMap(map_name) {
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "hasMap/map_name");
    const row = runStatement("SELECT 1 FROM players_follow WHERE map_name = ?", [validatedMapName], "hasMap", "get");
    return row !== undefined;
}

/**
 * Unfollow all maps for a user
 * @param {string} discord_id - The Discord user ID
 */
export function unfollowAll(discord_id) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "unfollowAll/discord_id");
    runStatement("DELETE FROM players_follow WHERE discord_id = ?", [validatedDiscordId], "unfollowAll", "run");
}
