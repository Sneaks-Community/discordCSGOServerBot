// ES module version using better-sqlite3
import Database from "better-sqlite3";

let db = null;

/**
 * Initialize the database and create tables if they don't exist
 */
async function initDB() {
    db = new Database('db.sqlite');
    // Create table called players_follow with columns for discord_id, map_name, and a unique index on conflict replace
    db.exec(`
        CREATE TABLE IF NOT EXISTS players_follow (
            discord_id TEXT,
            map_name TEXT,
            UNIQUE(discord_id, map_name) ON CONFLICT REPLACE
        )
    `);
}

/**
 * Follow a map for a user
 * @param {string} discord_id - The Discord user ID
 * @param {string} map_name - The map name to follow
 */
function followMap(discord_id, map_name) {
    const stmt = db.prepare("INSERT INTO players_follow VALUES (?, ?)");
    try {
        stmt.run(discord_id, map_name);
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
    const stmt = db.prepare("DELETE FROM players_follow WHERE discord_id = ? AND map_name = ?");
    try {
        stmt.run(discord_id, map_name);
    } catch (err) {
        console.error("Database error in unfollowMap:", err);
        throw err;
    }
}

/**
 * Get followers of a map
 * @param {string} map_name - The map name
 * @returns {Array} - Array of objects with discord_id property
 */
function getFollowers(map_name) {
    const stmt = db.prepare("SELECT discord_id FROM players_follow WHERE map_name = ?");
    try {
        return stmt.all(map_name);
    } catch (err) {
        console.error("Database error in getFollowers:", err);
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
    const stmt = db.prepare("SELECT * FROM players_follow WHERE discord_id = ? AND map_name = ?");
    try {
        return stmt.get(discord_id, map_name);
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
    const stmt = db.prepare("SELECT discord_id FROM players_follow WHERE map_name = ?");
    try {
        return stmt.all(map_name);
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
    const stmt = db.prepare("SELECT * FROM players_follow WHERE map_name = ?");
    try {
        return stmt.get(map_name);
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
    const stmt = db.prepare("DELETE FROM players_follow WHERE discord_id = ?");
    try {
        stmt.run(discord_id);
    } catch (err) {
        console.error("Database error in unfollowAll:", err);
        throw err;
    }
}

/**
 * Get total number of follows in the database
 * @returns {Object} - Object with total count
 */
function totalFollows() {
    const stmt = db.prepare("SELECT COUNT(*) AS total FROM players_follow");
    try {
        return stmt.get();
    } catch (err) {
        console.error("Database error in totalFollows:", err);
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
    getFollowers,
    getAllFollows,
    getUserFollows,
    isFollowingMap,
    getUsersFollowingMap,
    hasMap,
    unfollowAll,
    totalFollows,
    closeDB
};