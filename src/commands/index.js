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

// Admin user IDs from config
const allowedDevs = config.security?.adminUserIds || [];

/**
 * Slash command definitions
 */
export const slashCommands = [
    new SlashCommandBuilder()
        .setName("players")
        .setDescription("Show players on a server")
        .addStringOption(option =>
            option.setName("server")
                .setDescription("Server keyword or name")
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName("map")
        .setDescription("Show current map on a server or map stats")
        .addStringOption(option =>
            option.setName("server")
                .setDescription("Server keyword or map name")
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName("keywords")
        .setDescription("List all available server keywords"),
    new SlashCommandBuilder()
        .setName("follow")
        .setDescription("Follow a map to receive DM notifications")
        .addStringOption(option =>
            option.setName("map")
                .setDescription("Map name to follow")
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName("unfollow")
        .setDescription("Stop following a map")
        .addStringOption(option =>
            option.setName("map")
                .setDescription("Map name to unfollow (or \"all\" for all maps)")
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName("listfollows")
        .setDescription("List all maps you are following"),
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show list of available commands"),
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check bot latency"),
    new SlashCommandBuilder()
        .setName("version")
        .setDescription("Show bot version"),
    // Admin commands
    new SlashCommandBuilder()
        .setName("check")
        .setDescription("Check server status by IP, domain, or keyword (Admin only)")
        .addStringOption(option =>
            option.setName("server")
                .setDescription("Server IP address, domain name (e.g., example.com:27015), or keyword")
                .setRequired(true))
        .setDefaultMemberPermissions(0), // Admin only
    new SlashCommandBuilder()
        .setName("listallfollows")
        .setDescription("List all users and their followed maps (Admin only)")
        .setDefaultMemberPermissions(0),
    new SlashCommandBuilder()
        .setName("testnotify")
        .setDescription("Test map notification system (Admin only)")
        .addStringOption(option =>
            option.setName("map")
                .setDescription("Map name to test")
                .setRequired(true))
        .setDefaultMemberPermissions(0),
    new SlashCommandBuilder()
        .setName("removeuser")
        .setDescription("Remove all follows for a user (Admin only)")
        .addStringOption(option =>
            option.setName("userid")
                .setDescription("Discord user ID")
                .setRequired(true))
        .setDefaultMemberPermissions(0),
    new SlashCommandBuilder()
        .setName("mem")
        .setDescription("Show memory usage (Admin only)")
        .setDefaultMemberPermissions(0)
].map(command => command.toJSON());

/**
 * Register slash commands with Discord
 * @param {Object} bot - The Discord bot client
 */
export async function registerSlashCommands(bot) {
    try {
        const rest = new REST({ version: "10" }).setToken(config.discord.token);
        
        // Get application ID - use bot.application.id if available, fallback to bot.user.id
        const applicationId = bot.application?.id || bot.user?.id;
        if (!applicationId) {
            throw new Error("Unable to get application ID - bot may not be fully initialized");
        }
    
        // Register commands globally (or for specific guild)
        if (config.discord?.guildID) {
            // Guild commands update instantly (good for development)
            await rest.put(
                Routes.applicationGuildCommands(applicationId, config.discord.guildID),
                { body: slashCommands }
            );
            console.log(`Successfully registered ${slashCommands.length} guild slash commands`);
        } else {
            // Global commands take up to an hour to update
            await rest.put(
                Routes.applicationCommands(applicationId),
                { body: slashCommands }
            );
            console.log(`Successfully registered ${slashCommands.length} global slash commands`);
        }
    } catch (error) {
        console.error("Error registering slash commands:", error);
        // Re-throw to allow caller to handle the error
        throw error;
    }
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

    const { commandName } = interaction;
    const isAdmin = allowedDevs.includes(interaction.user.id);

    try {
        // Handle public commands
        if (commandName === "players") {
            await handleSlashPlayers(interaction);
        } else if (commandName === "map") {
            await handleSlashMap(interaction);
        } else if (commandName === "keywords") {
            await handleSlashKeywords(interaction);
        } else if (commandName === "follow") {
            await handleSlashFollow(interaction, Discord);
        } else if (commandName === "unfollow") {
            await handleSlashUnfollow(interaction, Discord);
        } else if (commandName === "listfollows") {
            await handleSlashListfollows(interaction);
        } else if (commandName === "help") {
            await handleSlashHelp(interaction);
        } else if (commandName === "ping") {
            await handleSlashPing(interaction);
        } else if (commandName === "version") {
            await handleSlashVersion(interaction);
        }
        // Handle admin commands
        else if (commandName === "check" && isAdmin) {
            await handleSlashCheck(interaction);
        } else if (commandName === "listallfollows" && isAdmin) {
            await handleSlashListallfollows(interaction);
        } else if (commandName === "testnotify" && isAdmin) {
            await handleSlashTestnotify(interaction, bot, logChannel);
        } else if (commandName === "removeuser" && isAdmin) {
            await handleSlashRemoveuser(interaction);
        } else if (commandName === "mem" && isAdmin) {
            await handleSlashMem(interaction);
        } else {
            await interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
        }
    } catch (error) {
        console.error(`Error handling slash command ${commandName}:`, error);
        const replyMethod = interaction.replied || interaction.deferred ? "editReply" : "reply";
        await interaction[replyMethod]({ content: "An error occurred while processing your command.", ephemeral: true }).catch(() => {});
    }
}