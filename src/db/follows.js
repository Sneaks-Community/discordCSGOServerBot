/**
 * Database follow operations
 * Handles all follow/unfollow database operations
 */

import { getDB } from "./connection.js";
import { validateDiscordId, validateMapNameInput } from "./validation.js";
import { dbLogger } from "../utils/logger.js";

/**
 * Helper to validate and execute database operations
 * @param {Function} validateFn - Validation function
 * @param {any} value - Value to validate
 * @param {string} errorPrefix - Prefix for error messages
 * @returns {Object} Validation result
 */
function validateOrThrow(validateFn, value, errorPrefix) {
    const result = validateFn(value);
    if (!result.valid) {
        throw new Error(`${errorPrefix}: ${result.error}`);
    }
    return result;
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
    const stmt = db.prepare(sql);
    try {
        return stmt.run(...params);
    } catch (err) {
        dbLogger.error(`Database error in ${operationName}:`, err);
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
    const stmt = db.prepare(sql);
    try {
        return single ? stmt.get(...params) : stmt.all(...params);
    } catch (err) {
        dbLogger.error(`Database error in ${operationName}:`, err);
        throw err;
    }
}

/**
 * Follow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to follow
 */
export function followMap(discord_id, map_name) {
    const mapValidation = validateOrThrow(validateMapNameInput, map_name, "followMap");
    execStmt("INSERT INTO players_follow VALUES (?, ?)", [discord_id, mapValidation.sanitized], "followMap");
}

/**
 * Unfollow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to unfollow
 */
export function unfollowMap(discord_id, map_name) {
    const mapValidation = validateOrThrow(validateMapNameInput, map_name, "unfollowMap");
    execStmt("DELETE FROM players_follow WHERE discord_id = ? AND map_name = ?", [discord_id, mapValidation.sanitized], "unfollowMap");
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
    validateOrThrow(validateDiscordId, discord_id, "getUserFollows");
    return performQuery("SELECT map_name FROM players_follow WHERE discord_id = ?", [discord_id], "getUserFollows");
}

/**
 * Check if a user is following a specific map
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name
 * @returns {Object|null} - Row object if following, null otherwise
 */
export function isFollowingMap(discord_id, map_name) {
    const mapValidation = validateOrThrow(validateMapNameInput, map_name, "isFollowingMap");
    return performQuery("SELECT * FROM players_follow WHERE discord_id = ? AND map_name = ?", [discord_id, mapValidation.sanitized], "isFollowingMap", true);
}

/**
 * Get users following a specific map
 * @param {string} map_name - The map name
 * @returns {Array} - Array of objects with discord_id property
 */
export function getUsersFollowingMap(map_name) {
    const mapValidation = validateOrThrow(validateMapNameInput, map_name, "getUsersFollowingMap");
    return performQuery("SELECT discord_id FROM players_follow WHERE map_name = ?", [mapValidation.sanitized], "getUsersFollowingMap");
}

/**
 * Check if any user is following a specific map
 * @param {string} map_name - The map name
 * @returns {Object|null} - Row object if exists, null otherwise
 */
export function hasMap(map_name) {
    const mapValidation = validateOrThrow(validateMapNameInput, map_name, "hasMap");
    return performQuery("SELECT * FROM players_follow WHERE map_name = ?", [mapValidation.sanitized], "hasMap", true);
}

/**
 * Unfollow all maps for a user
 * @param {string} discord_id - The Discord user ID
 */
export function unfollowAll(discord_id) {
    validateOrThrow(validateDiscordId, discord_id, "unfollowAll");
    execStmt("DELETE FROM players_follow WHERE discord_id = ?", [discord_id], "unfollowAll");
}
