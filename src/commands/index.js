/**
 * Slash command registration and dispatcher
 * Handles command registration and routes interactions to handlers
 */

import { SlashCommandBuilder, REST, Routes, MessageFlags } from "discord.js";

import { config } from "../config/index.js";
import { commandLogger } from "../utils/logger.js";
import { handleSlashListallfollows, handleSlashTestnotify, handleSlashRemoveuser } from "./adminCommands.js";
import { handleSlashFollow, handleSlashUnfollow, handleSlashListfollows } from "./followCommands.js";
import { handleSlashPlayers, handleSlashKeywords } from "./playerCommands.js";
import { handleSlashHelp, handleSlashPing } from "./utilityCommands.js";

// Admin role ID from config. envSchema guarantees a snowflake or "" (disabled).
const adminRoleId = config.security.adminRoleId;

/**
 * Public command handlers map - O(1) lookup
 * @type {Map<string, Function>}
 */
const publicCommands = new Map([
    ["players", handleSlashPlayers],
    ["keywords", handleSlashKeywords],
    ["follow", handleSlashFollow],
    ["unfollow", handleSlashUnfollow],
    ["listfollows", handleSlashListfollows],
    ["help", handleSlashHelp],
    ["ping", handleSlashPing]
]);

/**
 * Admin command handlers map - O(1) lookup
 * @type {Map<string, Function>}
 */
const adminCommands = new Map([
    ["listallfollows", handleSlashListallfollows],
    ["testnotify", handleSlashTestnotify],
    ["removeuser", handleSlashRemoveuser]
]);

/**
 * Get command handler metadata for building slash commands
 * @returns {Array<{name: string, description: string, admin: boolean, options?: Function}>}
 */
function getCommandDefinitions() {
    return [
        { admin: false, description: "Show players on a server", name: "players",
            options: opt => opt.setName("server").setDescription("Server keyword or name").setRequired(false) },
        { admin: false, description: "List all available server keywords", name: "keywords" },
        { admin: false, description: "Follow a map to receive DM notifications", name: "follow",
            options: opt => opt.setName("map").setDescription("Map name to follow").setRequired(true) },
        { admin: false, description: "Stop following a map", name: "unfollow",
            options: opt => opt.setName("map").setDescription("Map name to unfollow (or 'all' for all maps)").setRequired(true) },
        { admin: false, description: "List all maps you are following", name: "listfollows" },
        { admin: false, description: "Show list of available commands", name: "help" },
        { admin: false, description: "Check bot latency", name: "ping" },
        { admin: true, description: "List all users and their followed maps (Admin only)", name: "listallfollows" },
        { admin: true, description: "Test map notification system (Admin only)", name: "testnotify",
            options: opt => opt.setName("map").setDescription("Map name to test").setRequired(true) },
        { admin: true, description: "Remove all follows for a user (Admin only)", name: "removeuser",
            options: opt => opt.setName("userid").setDescription("Discord user ID").setRequired(true) }
    ];
}

/**
 * Build SlashCommandBuilder instances from definitions
 * @returns {SlashCommandBuilder[]}
 */
function buildSlashCommands() {
    return getCommandDefinitions().map(def => {
        const builder = new SlashCommandBuilder()
            .setName(def.name)
            .setDescription(def.description);
        
        if (def.admin) {
            builder.setDefaultMemberPermissions(0);
        }
        if (def.options) {
            builder.addStringOption(def.options);
        }
        return builder;
    });
}

/**
 * Slash command definitions (JSON format for Discord API)
 */
const slashCommands = buildSlashCommands().map(cmd => cmd.toJSON());

/**
 * Register slash commands with Discord
 * @param {Object} bot - The Discord bot client
 */
export async function registerSlashCommands(bot) {
    try {
        const rest = new REST({ version: "10" }).setToken(config.discord.token);
        
        const applicationId = bot.application?.id || bot.user?.id;
        if (!applicationId) {
            throw new Error("Unable to get application ID - bot may not be fully initialized");
        }
    
        if (config.discord.guildID) {
            await rest.put(
                Routes.applicationGuildCommands(applicationId, config.discord.guildID),
                { body: slashCommands }
            );
            commandLogger.info(`Successfully registered ${slashCommands.length} guild slash commands`);
        } else {
            await rest.put(
                Routes.applicationCommands(applicationId),
                { body: slashCommands }
            );
            commandLogger.info(`Successfully registered ${slashCommands.length} global slash commands`);
        }
    } catch (err) {
        commandLogger.error({ err }, "Error registering slash commands");
        throw err;
    }
}

/**
 * Audit log helper for admin command attempts
 * @param {string} commandName - The command that was attempted
 * @param {string} userId - The user ID that attempted the command
 * @param {string} username - The username of the user
 */
function logAdminCommandAttempt(commandName, userId, username) {
    commandLogger.info({ command: commandName, userId, username }, "Admin command attempt by non-admin user");
}

/**
 * Check whether the invoking member has the admin role.
 * `interaction.member` is a GuildMember when the guild is cached, but a raw
 * APIInteractionGuildMember when it is not, and there `roles` is an array of IDs
 * with no `cache`. Handle both so an admin is never denied over a cache miss.
 * @param {Object} interaction - Discord interaction object
 * @returns {boolean} - Whether the member has the admin role
 */
function hasAdminRole(interaction) {
    if (!adminRoleId) return false;

    const roles = interaction.member?.roles;
    if (!roles) return false;

    return Array.isArray(roles) ? roles.includes(adminRoleId) : roles.cache?.has(adminRoleId) === true;
}

/**
 * Handle slash command interactions
 * @param {Object} interaction - Discord interaction object
 * @param {Object} bot - Discord bot client
 */
export async function handleInteraction(interaction, bot) {
    if (!interaction.isChatInputCommand()) return;

    // Ensure interaction is from a guild (not DM). inGuild() tests guildId + member,
    // so an uncached guild still counts; interaction.guild would be null there and
    // report a real in-guild command as a DM.
    if (!interaction.inGuild()) {
        return interaction.reply({ content: "This bot is only available in servers.", flags: MessageFlags.Ephemeral });
    }

    const { commandName } = interaction;
    const isAdmin = hasAdminRole(interaction);
    const userId = interaction.user?.id || "unknown";
    const username = interaction.user?.username || "unknown";

    try {
        // Check admin commands first (requires auth)
        if (adminCommands.has(commandName)) {
            if (!isAdmin) {
                logAdminCommandAttempt(commandName, userId, username);
                return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
            }
            commandLogger.info({ command: commandName, userId, username }, "Admin command executed");
            const handler = adminCommands.get(commandName);
            // Some handlers need extra params
            if (commandName === "testnotify") {
                return await handler(interaction, bot);
            }
            return await handler(interaction);
        }

        // Check public commands
        if (publicCommands.has(commandName)) {
            const handler = publicCommands.get(commandName);
            return await handler(interaction);
        }

        // Unknown command
        await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral });
    } catch (err) {
        commandLogger.error({ command: commandName, err }, "Error handling slash command");
        const content = "An error occurred while processing your command.";
        // An already-deferred/replied interaction keeps the ephemerality it was
        // created with; editReply cannot change it, so the flag is only set here
        // when this is the interaction's first response.
        const response = interaction.replied || interaction.deferred
            ? interaction.editReply({ content })
            : interaction.reply({ content, flags: MessageFlags.Ephemeral });
        await response.catch(() => {});
    }
}
