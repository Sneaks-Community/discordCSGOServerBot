/**
 * Admin authorization for slash commands.
 * Separate from the dispatcher so /help can ask the same question when deciding
 * whether to list the admin commands, and so there is only one answer to it.
 */

import { PermissionFlagsBits } from "discord.js";

import { config } from "../config/index.js";

// Admin role ID from config. envSchema guarantees a snowflake or "" (disabled).
const adminRoleId = config.security.adminRoleId;

/**
 * Check whether the invoking member may use the admin commands.
 * Discord Administrators and the guild owner qualify as well as the configured
 * role: setDefaultMemberPermissions(0) shows the commands to exactly those two,
 * so authorizing them here stops the picker and the gate from disagreeing.
 * `interaction.member` is a GuildMember when the guild is cached, but a raw
 * APIInteractionGuildMember when it is not, and there `roles` is an array of IDs
 * with no `cache`. Handle both so an admin is never denied over a cache miss.
 * @param {Object} interaction - Discord interaction object
 * @returns {boolean} - Whether the member may use the admin commands
 */
export function hasAdminRole(interaction) {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true) return true;

    const ownerId = interaction.guild?.ownerId;
    if (ownerId && ownerId === interaction.user?.id) return true;

    if (!adminRoleId) return false;

    const roles = interaction.member?.roles;
    if (!roles) return false;

    return Array.isArray(roles) ? roles.includes(adminRoleId) : roles.cache?.has(adminRoleId) === true;
}
