/**
 * Discord permission checking utilities
 * Validates bot permissions in channels
 */

import { REQUIRED_PERMISSIONS } from "../config/index.js";

/**
 * Check if bot has required permissions in a channel
 * @param {import('discord.js').GuildChannel} channel - The channel to check
 * @param {string[]} requiredPermissions - Array of permission names to check
 * @returns {Object} - { hasPermissions: boolean, missing: string[] }
 */
export function checkChannelPermissions(channel, requiredPermissions = []) {
    if (!channel) {
        return { hasPermissions: false, missing: ["Channel not found"] };
    }
    
    // Check if channel is a text-based channel
    if (!channel.isTextBased?.()) {
        return { hasPermissions: false, missing: ["Channel is not text-based"] };
    }
    
    const missing = [];
    const botMember = channel.guild?.members?.me;
    
    if (!botMember) {
        return { hasPermissions: false, missing: ["Bot member not found in guild"] };
    }
    
    const permissions = channel.permissionsFor(botMember);
    if (!permissions) {
        return { hasPermissions: false, missing: ["Could not resolve permissions"] };
    }
    
    // Check each required permission
    for (const perm of requiredPermissions) {
        if (!permissions.has(perm)) {
            missing.push(perm);
        }
    }
    
    return {
        hasPermissions: missing.length === 0,
        missing
    };
}

/**
 * Validate bot can send messages to a channel
 * @param {import('discord.js').GuildChannel} channel - The channel to validate
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateChannelForSend(channel) {
    const result = checkChannelPermissions(channel, [
        REQUIRED_PERMISSIONS.VIEW_CHANNEL,
        REQUIRED_PERMISSIONS.SEND_MESSAGES,
        REQUIRED_PERMISSIONS.EMBED_LINKS
    ]);
    
    if (!result.hasPermissions) {
        return {
            error: `Missing permissions: ${result.missing.join(", ")}`,
            valid: false
        };
    }
    
    return { valid: true };
}

/**
 * Validate bot can edit messages in a channel
 * @param {import('discord.js').GuildChannel} channel - The channel to validate
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateChannelForEdit(channel) {
    const result = checkChannelPermissions(channel, [
        REQUIRED_PERMISSIONS.VIEW_CHANNEL,
        REQUIRED_PERMISSIONS.READ_MESSAGE_HISTORY,
        REQUIRED_PERMISSIONS.EMBED_LINKS
    ]);
    
    if (!result.hasPermissions) {
        return {
            error: `Missing permissions: ${result.missing.join(", ")}`,
            valid: false
        };
    }
    
    return { valid: true };
}