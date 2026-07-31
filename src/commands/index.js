/**
 * Slash command registration and dispatcher
 * Handles command registration and routes interactions to handlers
 */

import { REST, Routes, MessageFlags } from "discord.js";

import { config } from "../config/index.js";
import { commandLogger } from "../utils/logger.js";
import { hasAdminRole } from "./adminAuth.js";
import { buildSlashCommands, COMMANDS_BY_NAME } from "./definitions.js";

/**
 * Slash command definitions (JSON format for Discord API)
 */
const slashCommands = buildSlashCommands();

/**
 * Register slash commands with Discord.
 *
 * Throws without logging: only the caller knows whether a failure is fatal, and
 * logging here as well would report every failure twice.
 * @param {Object} bot - The Discord bot client
 * @throws {Error} If the application ID is unavailable or either REST call fails
 */
export async function registerSlashCommands(bot) {
    const rest = new REST({ version: "10" }).setToken(config.discord.token);

    const applicationId = bot.application?.id || bot.user?.id;
    if (!applicationId) {
        throw new Error("Unable to get application ID - bot may not be fully initialized");
    }

    // Discord keeps global and guild commands as separate sets, so commands an
    // earlier run registered globally would stay visible in every guild forever.
    // Clearing them here makes "this bot has no global commands" a guarantee.
    await rest.put(Routes.applicationCommands(applicationId), { body: [] });

    await rest.put(
        Routes.applicationGuildCommands(applicationId, config.discord.guildID),
        { body: slashCommands }
    );
    commandLogger.info(`Successfully registered ${slashCommands.length} guild slash commands`);
}

/**
 * Handle slash command interactions
 * @param {Object} interaction - Discord interaction object
 */
export async function handleInteraction(interaction) {
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
        // The same array Discord was registered from, so anything Discord can send
        // has a handler here by construction.
        const command = COMMANDS_BY_NAME.get(commandName);
        if (!command) {
            await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral });
            return;
        }

        // Hiding a command in the picker is not a gate; this is.
        if (command.admin) {
            if (!isAdmin) {
                commandLogger.info({ command: commandName, userId, username }, "Admin command attempt by non-admin user");
                return interaction.reply({ content: "You do not have permission to use this command.", flags: MessageFlags.Ephemeral });
            }
            commandLogger.info({ command: commandName, userId, username }, "Admin command executed");
        }

        return await command.handler(interaction);
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
