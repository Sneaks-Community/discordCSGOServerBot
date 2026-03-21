/**
 * Database follow operations
 * Handles all follow/unfollow database operations
 */

import { getDB } from "./connection.js";
import { validateDiscordId, validateMapNameInput } from "./validation.js";

/**
 * Follow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to follow
 */
export function followMap(discord_id, map_name) {
    const db = getDB();
    
    // Validate inputs to prevent SQL injection
    const idValidation = validateDiscordId(discord_id);
    if (!idValidation.valid) {
        throw new Error(idValidation.error);
    }
    
    const mapValidation = validateMapNameInput(map_name);
    if (!mapValidation.valid) {
        throw new Error(mapValidation.error);
    }
    
    const stmt = db.prepare("INSERT INTO players_follow VALUES (?, ?)");
    try {
        stmt.run(discord_id, mapValidation.sanitized);
    } catch (err) {
        console.error("Database error in followMap:", err);
        throw err;
    }
}

/**
 * Unfollow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to unfollow
 */
export function unfollowMap(discord_id, map_name) {
    const db = getDB();
    
    // Validate inputs to prevent SQL injection
    const idValidation = validateDiscordId(discord_id);
    if (!idValidation.valid) {
        throw new Error(idValidation.error);
    }
    
    const mapValidation = validateMapNameInput(map_name);
    if (!mapValidation.valid) {
        throw new Error(mapValidation.error);
    }
    
    const stmt = db.prepare("DELETE FROM players_follow WHERE discord_id = ? AND map_name = ?");
    try {
        stmt.run(discord_id, mapValidation.sanitized);
    } catch (err) {
        console.error("Database error in unfollowMap:", err);
        throw err;
    }
}

/**
 * Get all follows from the database
 * @returns {Array} - Array of all rows from players_follow
 */
export function getAllFollows() {
    const db = getDB();
    
    const stmt = db.prepare("SELECT * FROM players_follow");
    try {
        return stmt.all();
    } catch (err) {
        console.error("Database error in getAllFollows:", err);
        throw err;
    }
}

/**
 * Get maps followed by a user
 * @param {string} discord_id - The Discord user ID
 * @returns {Array} - Array of objects with map_name property
 */
export function getUserFollows(discord_id) {
    const db = getDB();
    
    // Validate Discord ID input
    const idValidation = validateDiscordId(discord_id);
    if (!idValidation.valid) {
        throw new Error(idValidation.error);
    }
    
    const stmt = db.prepare("SELECT map_name FROM players_follow WHERE discord_id = ?");
    try {
        return stmt.all(discord_id);
    } catch (err) {
        console.error("Database error in getUserFollows:", err);
        throw err;
    }
}

/**
 * Check if a user is following a specific map
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name
 * @returns {Object|null} - Row object if following, null otherwise
 */
export function isFollowingMap(discord_id, map_name) {
    const db = getDB();
    
    // Validate inputs to prevent SQL injection
    const idValidation = validateDiscordId(discord_id);
    if (!idValidation.valid) {
        throw new Error(idValidation.error);
    }
    
    const mapValidation = validateMapNameInput(map_name);
    if (!mapValidation.valid) {
        throw new Error(mapValidation.error);
    }
    
    const stmt = db.prepare("SELECT * FROM players_follow WHERE discord_id = ? AND map_name = ?");
    try {
        return stmt.get(discord_id, mapValidation.sanitized);
    } catch (err) {
        console.error("Database error in isFollowingMap:", err);
        throw err;
    }
}

/**
 * Get users following a specific map
 * @param {string} map_name - The map name
 * @returns {Array} - Array of objects with discord_id property
 */
export function getUsersFollowingMap(map_name) {
    const db = getDB();
    
    // Validate map name input
    const mapValidation = validateMapNameInput(map_name);
    if (!mapValidation.valid) {
        throw new Error(mapValidation.error);
    }
    
    const stmt = db.prepare("SELECT discord_id FROM players_follow WHERE map_name = ?");
    try {
        return stmt.all(mapValidation.sanitized);
    } catch (err) {
        console.error("Database error in getUsersFollowingMap:", err);
        throw err;
    }
}

/**
 * Check if any user is following a specific map
 * @param {string} map_name - The map name
 * @returns {Object|null} - Row object if exists, null otherwise
 */
export function hasMap(map_name) {
    const db = getDB();
    
    // Validate map name input
    const mapValidation = validateMapNameInput(map_name);
    if (!mapValidation.valid) {
        throw new Error(mapValidation.error);
    }
    
    const stmt = db.prepare("SELECT * FROM players_follow WHERE map_name = ?");
    try {
        return stmt.get(mapValidation.sanitized);
    } catch (err) {
        console.error("Database error in hasMap:", err);
        throw err;
    }
}

/**
 * Unfollow all maps for a user
 * @param {string} discord_id - The Discord user ID
 */
export function unfollowAll(discord_id) {
    const db = getDB();
    
    // Validate Discord ID input
    const idValidation = validateDiscordId(discord_id);
    if (!idValidation.valid) {
        throw new Error(idValidation.error);
    }
    
    const stmt = db.prepare("DELETE FROM players_follow WHERE discord_id = ?");
    try {
        stmt.run(discord_id);
    } catch (err) {
        console.error("Database error in unfollowAll:", err);
        throw err;
    }
}