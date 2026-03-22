/**
 * Database module - main entry point
 * Re-exports all database functions for easy importing
 */

// Connection management
export { initDB, closeDB } from "./connection.js";

// Validation functions
export { validateDiscordId, validateMapNameInput } from "./validation.js";

// Follow operations
export {
    followMap,
    unfollowMap,
    getAllFollows,
    getUserFollows,
    isFollowingMap,
    getUsersFollowingMap,
    hasMap,
    unfollowAll
} from "./follows.js";