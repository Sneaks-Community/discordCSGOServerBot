import { PermissionFlagsBits, PermissionsBitField } from "discord.js";

/**
 * @param {import('discord.js').GuildChannel} channel
 * @param {bigint[]} [requiredPermissions] - Permission flags to check
 * @returns {{hasPermissions: boolean, missing: string[]}}
 */
function checkChannelPermissions(channel, requiredPermissions = []) {
    if (!channel) {
        return { hasPermissions: false, missing: ["Channel not found"] };
    }

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
    
    // A missing flag is rendered back to its Discord name, so an operator reads
    // the same wording the client shows.
    for (const perm of requiredPermissions) {
        if (!permissions.has(perm)) {
            missing.push(...new PermissionsBitField(perm).toArray());
        }
    }
    
    return {
        hasPermissions: missing.length === 0,
        missing
    };
}

/**
 * The { valid, error } shape the call sites report. Callers interpolate `error`
 * into their own remediation hint, so it is worded for an operator.
 * @param {import('discord.js').GuildChannel} channel
 * @param {bigint[]} requiredPermissions
 * @returns {{valid: boolean, error?: string}}
 */
function validateChannel(channel, requiredPermissions) {
    const result = checkChannelPermissions(channel, requiredPermissions);

    if (!result.hasPermissions) {
        return {
            error: `Missing permissions: ${result.missing.join(", ")}`,
            valid: false
        };
    }

    return { valid: true };
}

/**
 * @param {import('discord.js').GuildChannel} channel
 * @returns {{valid: boolean, error?: string}}
 */
export function validateChannelForSend(channel) {
    return validateChannel(channel, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ]);
}

/**
 * @param {import('discord.js').GuildChannel} channel
 * @returns {{valid: boolean, error?: string}}
 */
export function validateChannelForEdit(channel) {
    return validateChannel(channel, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks
    ]);
}