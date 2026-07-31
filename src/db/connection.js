/**
 * Database connection management
 * Handles database initialization and connection lifecycle
 */

import Database from "better-sqlite3";

import { config } from "../config/index.js";
import { dbLogger } from "../utils/logger.js";

let db = null;

/**
 * Cache of prepared statements keyed by SQL text. better-sqlite3 recommends
 * preparing a statement once and reusing it rather than re-preparing on every
 * call. Statements belong to the connection that created them, so the cache is
 * cleared whenever the connection changes (initDB and closeDB).
 * @type {Map<string, import("better-sqlite3").Statement>}
 */
const statementCache = new Map();

/**
 * Initialize the database and create tables if they don't exist
 * Uses a transaction to ensure atomic initialization
 *
 * The path comes from DATABASE_PATH, validated as a non-empty string by
 * envSchema. In Docker set it to /app/data/db.sqlite so the file lands on the
 * persistent volume rather than in the container's writable layer.
 */
export function initDB() {
    const dbPath = config.database.path;
    dbLogger.info(`Initializing database at: ${dbPath}`);
    // Any statement cached here belongs to a previous connection
    statementCache.clear();
    db = new Database(dbPath);
    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");
    // Wait rather than throwing SQLITE_BUSY immediately if the file is locked, which
    // a WAL checkpoint or an operator with a sqlite3 shell open can both cause.
    // better-sqlite3 is synchronous, so this blocks the process; 5s is long enough to
    // outlast a checkpoint and short enough not to look like a hang.
    db.pragma("busy_timeout = 5000");

    // Use a transaction for atomic initialization
    const initTransaction = db.transaction(() => {
        // Create table players_follow with columns for discord_id, map_name
        // ON CONFLICT REPLACE: if a duplicate (discord_id, map_name) pair is inserted,
        // the old row is deleted and a new one is inserted. This is intentional for
        // the follow system -- if a user re-follows a map, we want a clean record.
        // Note: This changes the rowid on conflict, but there are no foreign keys
        // referencing this table, so no cascading issues occur.
        //
        // NOT NULL applies to newly created databases only: CREATE TABLE IF NOT EXISTS
        // leaves an existing table exactly as it is. No migration is needed, because
        // every write goes through the Zod schemas in follows.js, which reject a null
        // or empty id and map name, so no existing database can contain a NULL here.
        db.exec(`
            CREATE TABLE IF NOT EXISTS players_follow (
                discord_id TEXT NOT NULL,
                map_name TEXT NOT NULL,
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
    statementCache.clear();
    if (db) {
        db.close();
        db = null;
    }
}

/**
 * Get a prepared statement for the given SQL, preparing it on first use
 * @param {string} sql - SQL statement
 * @returns {import("better-sqlite3").Statement} - The cached prepared statement
 * @throws {Error} If the database has not been initialized
 */
export function getStatement(sql) {
    if (!db) throw new Error("Database not initialized");
    let stmt = statementCache.get(sql);
    if (!stmt) {
        stmt = db.prepare(sql);
        statementCache.set(sql, stmt);
    }
    return stmt;
}
