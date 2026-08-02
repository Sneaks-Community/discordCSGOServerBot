/**
 * Separate from the dispatcher so /help can ask the same question when deciding
 * what to list, and get the same answer.
 */

import { PermissionFlagsBits } from "discord.js";

import { config } from "../config/index.js";

// envSchema guarantees a snowflake, or "" (disabled) for the role.
const adminRoleId = config.security.adminRoleId;
const primaryGuildID = config.discord.guildID;

/**
 * Administrators and the guild owner qualify alongside the configured role,
 * because setDefaultMemberPermissions(0) shows the commands to exactly those
 * two and the picker must not disagree with the gate.
 *
 * `interaction.member` is a GuildMember when the guild is cached and a raw
 * APIInteractionGuildMember when it is not, where `roles` is an array of IDs
 * with no `cache`. Both are handled, so a cache miss never denies an admin.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {boolean}
 */
export function hasAdminRole(interaction) {
    // Administrator and ownership are true of any guild, and these commands act
    // on the whole database. Unreachable in practice, since the bot leaves every
    // other guild, but it costs one comparison.
    if (interaction.guildId !== primaryGuildID) return false;

    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true) return true;

    const ownerId = interaction.guild?.ownerId;
    if (ownerId && ownerId === interaction.user?.id) return true;

    if (!adminRoleId) return false;

    const roles = interaction.member?.roles;
    if (!roles) return false;

    return Array.isArray(roles) ? roles.includes(adminRoleId) : roles.cache?.has(adminRoleId) === true;
}
