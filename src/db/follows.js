/**
 * Database follow operations
 * Handles all follow/unfollow database operations
 *
 * Uses Zod v4 schemas for validation and parameterized queries for SQL injection prevention.
 */

import { discordIdSchema, mapNameSchema } from "../schemas/validationSchemas.js";
import { dbLogger } from "../utils/logger.js";
import { validateWithZod } from "../utils/zodValidator.js";
import { getDB } from "./connection.js";

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
        throw new Error(`${operationName}: ${result.error}`);
    }
    return result.data;
}

/**
 * Execute a prepared statement with error handling
 * @param {string} sql - SQL statement
 * @param {Array} params - Parameters for the statement
 * @param {string} operationName - Name of the operation for error logging
 * @returns {any} Result of the operation
 */
function execStmt(sql, params, operationName) {
    const db = getDB();
    if (!db) throw new Error("Database not initialized");
    const stmt = db.prepare(sql);
    try {
        return stmt.run(...params);
    } catch (err) {
        dbLogger.error({ err, operation: operationName }, "Database error");
        throw err;
    }
}

/**
 * Query the database with error handling
 * @param {string} sql - SQL statement
 * @param {Array} params - Parameters for the statement
 * @param {string} operationName - Name of the operation for error logging
 * @param {boolean} single - Return single row or all rows
 * @returns {any} Query result
 */
function performQuery(sql, params, operationName, single = false) {
    const db = getDB();
    if (!db) throw new Error("Database not initialized");
    const stmt = db.prepare(sql);
    try {
        return single ? stmt.get(...params) : stmt.all(...params);
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
    execStmt("INSERT INTO players_follow VALUES (?, ?)", [validatedDiscordId, validatedMapName], "followMap");
}

/**
 * Unfollow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to unfollow
 */
export function unfollowMap(discord_id, map_name) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "unfollowMap/discord_id");
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "unfollowMap/map_name");
    execStmt("DELETE FROM players_follow WHERE discord_id = ? AND map_name = ?", [validatedDiscordId, validatedMapName], "unfollowMap");
}

/**
 * Get all follows from the database
 * @returns {Array} - Array of all rows from players_follow
 */
export function getAllFollows() {
    return performQuery("SELECT * FROM players_follow", [], "getAllFollows");
}

/**
 * Get maps followed by a user
 * @param {string} discord_id - The Discord user ID
 * @returns {Array} - Array of objects with map_name property
 */
export function getUserFollows(discord_id) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "getUserFollows/discord_id");
    return performQuery("SELECT map_name FROM players_follow WHERE discord_id = ?", [validatedDiscordId], "getUserFollows");
}

/**
 * Count the maps a user follows
 * @param {string} discord_id - The Discord user ID
 * @returns {number} - Number of maps the user follows
 */
export function countUserFollows(discord_id) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "countUserFollows/discord_id");
    const row = performQuery("SELECT COUNT(*) AS count FROM players_follow WHERE discord_id = ?", [validatedDiscordId], "countUserFollows", true);
    return row?.count ?? 0;
}

/**
 * Check if a user is following a specific map
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name
 * @returns {Object|null} - Row object if following, null otherwise
 */
export function isFollowingMap(discord_id, map_name) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "isFollowingMap/discord_id");
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "isFollowingMap/map_name");
    return performQuery("SELECT * FROM players_follow WHERE discord_id = ? AND map_name = ?", [validatedDiscordId, validatedMapName], "isFollowingMap", true);
}

/**
 * Get users following a specific map
 * @param {string} map_name - The map name
 * @returns {Array} - Array of objects with discord_id property
 */
export function getUsersFollowingMap(map_name) {
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "getUsersFollowingMap/map_name");
    return performQuery("SELECT discord_id FROM players_follow WHERE map_name = ?", [validatedMapName], "getUsersFollowingMap");
}

/**
 * Check if any user is following a specific map
 * @param {string} map_name - The map name
 * @returns {Object|null} - Row object if exists, null otherwise
 */
export function hasMap(map_name) {
    const validatedMapName = validateOrThrow(mapNameSchema, map_name, "hasMap/map_name");
    return performQuery("SELECT * FROM players_follow WHERE map_name = ?", [validatedMapName], "hasMap", true);
}

/**
 * Unfollow all maps for a user
 * @param {string} discord_id - The Discord user ID
 */
export function unfollowAll(discord_id) {
    const validatedDiscordId = validateOrThrow(discordIdSchema, discord_id, "unfollowAll/discord_id");
    execStmt("DELETE FROM players_follow WHERE discord_id = ?", [validatedDiscordId], "unfollowAll");
}
