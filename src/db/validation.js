/**
 * Database input validation functions
 * Validates Discord IDs and map names before database operations
 */

/**
 * Validate Discord user ID format (numeric string, typically 17-19 characters)
 * @param {string} discordId - The Discord user ID to validate
 * @returns {Object} - Validation result with valid boolean and error message
 */
export function validateDiscordId(discordId) {
    if (!discordId || typeof discordId !== "string") {
        return { error: "Invalid Discord ID: must be a non-empty string", valid: false };
    }
    
    // Discord IDs are numeric strings (typically 17-19 digits)
    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(discordId)) {
        return { error: "Invalid Discord ID: must be a numeric string (17-19 digits)", valid: false };
    }
    
    return { valid: true };
}

/**
 * Validate map name format (alphanumeric, underscores, hyphens, max 64 chars)
 * @param {string} mapName - The map name to validate
 * @returns {Object} - Validation result with valid boolean and error message
 */
export function validateMapNameInput(mapName) {
    if (!mapName || typeof mapName !== "string") {
        return { error: "Invalid map name: must be a non-empty string", valid: false };
    }
    
    const trimmedMapName = mapName.trim();
    
    if (trimmedMapName.length === 0) {
        return { error: "Invalid map name: cannot be empty or whitespace", valid: false };
    }
    
    // Map names should only contain alphanumeric characters, underscores, and hyphens
    const mapNameRegex = /^[\w-]+$/;
    if (!mapNameRegex.test(trimmedMapName)) {
        return { error: "Invalid map name: contains invalid characters (only alphanumeric, underscores, and hyphens allowed)", valid: false };
    }
    
    // CS:GO map name limit is typically 64 characters
    if (trimmedMapName.length > 64) {
        return { error: "Invalid map name: too long (max 64 characters)", valid: false };
    }
    
    return { sanitized: trimmedMapName.toLowerCase(), valid: true };
}