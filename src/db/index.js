/**
 * Database module - main entry point
 * Re-exports all database functions for easy importing
 *
 * Every follow operation below is synchronous: better-sqlite3 blocks the process
 * for the duration of the query, so awaiting one buys nothing and only suggests
 * a yield point that does not exist. `initDB` is the one exception.
 */

// Connection management
export { initDB, closeDB } from "./connection.js";

// Follow operations
export {
    followMap,
    unfollowMap,
    countUserFollows,
    getAllFollows,
    getUserFollows,
    isFollowingMap,
    getUsersFollowingMap,
    hasMap,
    unfollowAll
} from "./follows.js";
