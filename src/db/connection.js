import Database from "better-sqlite3";

import { config } from "../config/index.js";
import { dbLogger } from "../utils/logger.js";

let db = null;

/**
 * Keyed by SQL text. Statements belong to the connection that created them, so
 * this is cleared whenever the connection changes.
 * @type {Map<string, import("better-sqlite3").Statement>}
 */
const statementCache = new Map();

/**
 * The path is DATABASE_PATH. In Docker set it to /app/data/db.sqlite so the file
 * lands on the persistent volume, not the container's writable layer.
 */
export function initDB() {
    const dbPath = config.database.path;
    dbLogger.info(`Initializing database at: ${dbPath}`);
    // Anything cached here belongs to a previous connection.
    statementCache.clear();
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    // Wait instead of throwing SQLITE_BUSY when the file is locked, which a WAL
    // checkpoint or an open sqlite3 shell can both cause. better-sqlite3 is
    // synchronous, so this blocks the process; 5s outlasts a checkpoint without
    // looking like a hang.
    db.pragma("busy_timeout = 5000");

    const initTransaction = db.transaction(() => {
        // ON CONFLICT REPLACE: re-following a map swaps in a clean row. It changes
        // the rowid, which is safe here because nothing references this table.
        //
        // NOT NULL only binds new databases: CREATE TABLE IF NOT EXISTS leaves an
        // existing table alone. No migration needed, because every write goes
        // through the Zod schemas in follows.js, which reject a null or empty id.
        db.exec(`
            CREATE TABLE IF NOT EXISTS players_follow (
                discord_id TEXT NOT NULL,
                map_name TEXT NOT NULL,
                UNIQUE(discord_id, map_name) ON CONFLICT REPLACE
            )
        `);
        db.exec("CREATE INDEX IF NOT EXISTS idx_map_name ON players_follow(map_name)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_discord_id ON players_follow(discord_id)");
    });

    initTransaction();
}

export function closeDB() {
    statementCache.clear();
    if (db) {
        db.close();
        db = null;
    }
}

/**
 * Prepares on first use, then reuses.
 * @param {string} sql
 * @returns {import("better-sqlite3").Statement}
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
