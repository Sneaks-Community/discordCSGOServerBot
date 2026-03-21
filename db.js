// ES module version using better-sqlite3
import Database from "better-sqlite3";

let db = null;

/**
 * Validate Discord user ID format (numeric string, typically 17-19 characters)
 * @param {string} discordId - The Discord user ID to validate
 * @returns {Object} - Validation result with valid boolean and error message
 */
function validateDiscordId(discordId) {
    if (!discordId || typeof discordId !== "string") {
        return { valid: false, error: "Invalid Discord ID: must be a non-empty string" };
    }
    
    // Discord IDs are numeric strings (typically 17-19 digits)
    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(discordId)) {
        return { valid: false, error: "Invalid Discord ID: must be a numeric string (17-19 digits)" };
    }
    
    return { valid: true };
}

/**
 * Validate map name format (alphanumeric, underscores, hyphens, max 64 chars)
 * @param {string} mapName - The map name to validate
 * @returns {Object} - Validation result with valid boolean and error message
 */
function validateMapNameInput(mapName) {
    if (!mapName || typeof mapName !== "string") {
        return { valid: false, error: "Invalid map name: must be a non-empty string" };
    }
    
    const trimmedMapName = mapName.trim();
    
    if (trimmedMapName.length === 0) {
        return { valid: false, error: "Invalid map name: cannot be empty or whitespace" };
    }
    
    // Map names should only contain alphanumeric characters, underscores, and hyphens
    const mapNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!mapNameRegex.test(trimmedMapName)) {
        return { valid: false, error: "Invalid map name: contains invalid characters (only alphanumeric, underscores, and hyphens allowed)" };
    }
    
    // CS:GO map name limit is typically 64 characters
    if (trimmedMapName.length > 64) {
        return { valid: false, error: "Invalid map name: too long (max 64 characters)" };
    }
    
    return { valid: true, sanitized: trimmedMapName.toLowerCase() };
}

/**
 * Initialize the database and create tables if they don't exist
 */
async function initDB() {
    db = new Database("db.sqlite");
    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");
    // Create table called players_follow with columns for discord_id, map_name, and a unique index on conflict replace
    db.exec(`
        CREATE TABLE IF NOT EXISTS players_follow (
            discord_id TEXT,
            map_name TEXT,
            UNIQUE(discord_id, map_name) ON CONFLICT REPLACE
        )
    `);
    // Add index on map_name for faster getFollowers queries
    db.exec("CREATE INDEX IF NOT EXISTS idx_map_name ON players_follow(map_name)");
}

/**
 * Follow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to follow
 */
function followMap(discord_id, map_name) {
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
function unfollowMap(discord_id, map_name) {
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
function getAllFollows() {
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
function getUserFollows(discord_id) {
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
function isFollowingMap(discord_id, map_name) {
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
function getUsersFollowingMap(map_name) {
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
function hasMap(map_name) {
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
function unfollowAll(discord_id) {
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

/**
 * Close the database connection
 */
function closeDB() {
    if (db) {
        db.close();
        db = null;
    }
}

export {
    initDB,
    followMap,
    unfollowMap,
    getAllFollows,
    getUserFollows,
    isFollowingMap,
    getUsersFollowingMap,
    hasMap,
    unfollowAll,
    closeDB
};