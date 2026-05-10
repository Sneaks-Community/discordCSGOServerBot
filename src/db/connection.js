/**
 * Database connection management
 * Handles database initialization and connection lifecycle
 */

import Database from "better-sqlite3";

import { dbLogger } from "../utils/logger.js";

let db = null;

/**
 * Get the database path from environment variable or use default
 * In Docker, set DATABASE_PATH=/app/data/db.sqlite to persist data
 * @returns {string} - The database file path
 */
function getDatabasePath() {
    return process.env.DATABASE_PATH || "db.sqlite";
}

/**
 * Initialize the database and create tables if they don't exist
 * Uses a transaction to ensure atomic initialization
 */
export function initDB() {
    const dbPath = getDatabasePath();
    dbLogger.info(`Initializing database at: ${dbPath}`);
    db = new Database(dbPath);
    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");
    
    // Use a transaction for atomic initialization
    const initTransaction = db.transaction(() => {
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
        // Add index on discord_id for faster getUserFollows queries (backwards compatible - uses IF NOT EXISTS)
        db.exec("CREATE INDEX IF NOT EXISTS idx_discord_id ON players_follow(discord_id)");
    });
    
    // Execute the transaction
    initTransaction();
}

/**
 * Close the database connection
 */
export function closeDB() {
    if (db) {
        db.close();
        db = null;
    }
}

/**
 * Get the database instance
 * @returns {Database|null} - The database instance or null if not initialized
 */
export function getDB() {
    return db;
}
