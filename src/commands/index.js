/**
 * Slash command registration and dispatcher
 * Handles command registration and routes interactions to handlers
 */

import { REST, Routes, MessageFlags } from "discord.js";

import { config } from "../config/index.js";
import { commandLogger } from "../utils/logger.js";
import { hasAdminRole } from "./adminAuth.js";
import { handleSlashListallfollows, handleSlashTestnotify, handleSlashRemoveuser } from "./adminCommands.js";
import { buildSlashCommands } from "./definitions.js";
import { handleSlashFollow, handleSlashUnfollow, handleSlashListfollows } from "./followCommands.js";
import { handleSlashPlayers, handleSlashKeywords } from "./playerCommands.js";
import { handleSlashHelp, handleSlashPing } from "./utilityCommands.js";

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
 * Slash command definitions (JSON format for Discord API)
 */
const slashCommands = buildSlashCommands();

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
