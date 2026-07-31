/**
 * Admin authorization for slash commands.
 * Separate from the dispatcher so /help can ask the same question when deciding
 * whether to list the admin commands, and so there is only one answer to it.
 */

import { config } from "../config/index.js";

// Admin role ID from config. envSchema guarantees a snowflake or "" (disabled).
const adminRoleId = config.security.adminRoleId;

/**
 * Check whether the invoking member has the admin role.
 * `interaction.member` is a GuildMember when the guild is cached, but a raw
 * APIInteractionGuildMember when it is not, and there `roles` is an array of IDs
 * with no `cache`. Handle both so an admin is never denied over a cache miss.
 * @param {Object} interaction - Discord interaction object
 * @returns {boolean} - Whether the member has the admin role
 */
export function hasAdminRole(interaction) {
    if (!adminRoleId) return false;

    const roles = interaction.member?.roles;
    if (!roles) return false;

    return Array.isArray(roles) ? roles.includes(adminRoleId) : roles.cache?.has(adminRoleId) === true;
}
