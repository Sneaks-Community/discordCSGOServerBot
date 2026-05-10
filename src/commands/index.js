/**
 * Slash command registration and dispatcher
 * Handles command registration and routes interactions to handlers
 */

import { SlashCommandBuilder, REST, Routes } from "discord.js";

import { config } from "../config/index.js";
import { handleSlashPlayers, handleSlashMap, handleSlashKeywords } from "./playerCommands.js";
import { handleSlashFollow, handleSlashUnfollow, handleSlashListfollows } from "./followCommands.js";
import { handleSlashCheck, handleSlashListallfollows, handleSlashTestnotify, handleSlashRemoveuser, handleSlashMem } from "./adminCommands.js";
import { handleSlashHelp, handleSlashPing, handleSlashVersion } from "./utilityCommands.js";
import { commandLogger } from "../utils/logger.js";

// Admin role ID from config
const adminRoleId = config.security?.adminRoleId || "";

/**
 * Public command handlers map - O(1) lookup
 * @type {Map<string, Function>}
 */
const publicCommands = new Map([
    ["players", handleSlashPlayers],
    ["map", handleSlashMap],
    ["keywords", handleSlashKeywords],
    ["follow", handleSlashFollow],
    ["unfollow", handleSlashUnfollow],
    ["listfollows", handleSlashListfollows],
    ["help", handleSlashHelp],
    ["ping", handleSlashPing],
    ["version", handleSlashVersion]
]);

/**
 * Admin command handlers map - O(1) lookup
 * @type {Map<string, Function>}
 */
const adminCommands = new Map([
    ["check", handleSlashCheck],
    ["listallfollows", handleSlashListallfollows],
    ["testnotify", handleSlashTestnotify],
    ["removeuser", handleSlashRemoveuser],
    ["mem", handleSlashMem]
]);

/**
 * Get command handler metadata for building slash commands
 * @returns {Array<{name: string, description: string, admin: boolean, options?: Function}>}
 */
function getCommandDefinitions() {
    return [
        { name: "players", description: "Show players on a server", admin: false,
            options: opt => opt.setName("server").setDescription("Server keyword or name").setRequired(false) },
        { name: "map", description: "Show current map on a server or map stats", admin: false,
            options: opt => opt.setName("server").setDescription("Server keyword or map name").setRequired(false) },
        { name: "keywords", description: "List all available server keywords", admin: false },
        { name: "follow", description: "Follow a map to receive DM notifications", admin: false,
            options: opt => opt.setName("map").setDescription("Map name to follow").setRequired(true) },
        { name: "unfollow", description: "Stop following a map", admin: false,
            options: opt => opt.setName("map").setDescription("Map name to unfollow (or 'all' for all maps)").setRequired(true) },
        { name: "listfollows", description: "List all maps you are following", admin: false },
        { name: "help", description: "Show list of available commands", admin: false },
        { name: "ping", description: "Check bot latency", admin: false },
        { name: "version", description: "Show bot version", admin: false },
        { name: "check", description: "Check server status by IP, domain, or keyword (Admin only)", admin: true,
            options: opt => opt.setName("server").setDescription("Server IP address, domain name (e.g., example.com:27015), or keyword").setRequired(true) },
        { name: "listallfollows", description: "List all users and their followed maps (Admin only)", admin: true },
        { name: "testnotify", description: "Test map notification system (Admin only)", admin: true,
            options: opt => opt.setName("map").setDescription("Map name to test").setRequired(true) },
        { name: "removeuser", description: "Remove all follows for a user (Admin only)", admin: true,
            options: opt => opt.setName("userid").setDescription("Discord user ID").setRequired(true) },
        { name: "mem", description: "Show memory usage (Admin only)", admin: true }
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
export const slashCommands = buildSlashCommands().map(cmd => cmd.toJSON());

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
    
        if (config.discord?.guildID) {
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
        commandLogger.error("Error registering slash commands:", err);
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
    commandLogger.info({ userId, username, command: commandName }, `Admin command attempt by non-admin user`);
}

/**
 * Handle slash command interactions
 * @param {Object} interaction - Discord interaction object
 * @param {Object} bot - Discord bot client
 * @param {Object} Discord - Discord.js library
 * @param {Object} logChannel - Log channel for notifications
 */
export async function handleInteraction(interaction, bot, Discord, logChannel) {
    if (!interaction.isChatInputCommand()) return;

    // Ensure interaction is from a guild (not DM)
    if (!interaction.guild) {
        return interaction.reply({ content: "This bot is only available in servers.", ephemeral: true });
    }

    const { commandName } = interaction;
    const isAdmin = adminRoleId && interaction.member?.roles?.cache?.has(adminRoleId);
    const userId = interaction.user?.id || "unknown";
    const username = interaction.user?.username || "unknown";

    try {
        // Check admin commands first (requires auth)
        if (adminCommands.has(commandName)) {
            if (!isAdmin) {
                logAdminCommandAttempt(commandName, userId, username);
                return interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
            }
            commandLogger.info({ userId, username, command: commandName }, `Admin command executed`);
            const handler = adminCommands.get(commandName);
            // Some handlers need extra params
            if (commandName === "testnotify") {
                return await handler(interaction, bot, logChannel);
            }
            return await handler(interaction);
        }

        // Check public commands
        if (publicCommands.has(commandName)) {
            const handler = publicCommands.get(commandName);
            // Some handlers need Discord param
            if (commandName === "follow" || commandName === "unfollow") {
                return await handler(interaction, Discord);
            }
            return await handler(interaction);
        }

        // Unknown command
        await interaction.reply({ content: "Unknown command.", ephemeral: true });
    } catch (err) {
        commandLogger.error(`Error handling slash command ${commandName}:`, err);
        const replyMethod = interaction.replied || interaction.deferred ? "editReply" : "reply";
        await interaction[replyMethod]({ content: "An error occurred while processing your command.", ephemeral: true }).catch(() => {});
    }
}
