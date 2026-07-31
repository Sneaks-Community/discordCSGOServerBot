/**
 * The single declaration of every slash command.
 *
 * What Discord registers and what /help lists are both derived from this array,
 * so a command cannot exist in one and be missing from the other, and no
 * description or option name is ever written out twice.
 */

import { SlashCommandBuilder } from "discord.js";

/**
 * Every command: its name, the description Discord shows, whether it requires
 * the admin role, and a callback adding its string option when it takes one.
 * @type {ReadonlyArray<{admin: boolean, description: string, name: string, options?: Function}>}
 */
export const COMMAND_DEFINITIONS = Object.freeze([
    { admin: false, description: "Show players on a server", name: "players",
        options: opt => opt.setName("server").setDescription("Server keyword or name").setRequired(false) },
    { admin: false, description: "List all available server keywords", name: "keywords" },
    { admin: false, description: "Follow a map to receive DM notifications", name: "follow",
        options: opt => opt.setName("map").setDescription("Map name to follow").setRequired(true) },
    { admin: false, description: "Stop following a map, or all your maps at once", name: "unfollow",
        options: opt => opt.setName("map").setDescription("Map name to unfollow (or 'all' for all maps)").setRequired(true) },
    { admin: false, description: "List all maps you are following", name: "listfollows" },
    { admin: false, description: "Show list of available commands", name: "help" },
    { admin: false, description: "Check bot latency", name: "ping" },
    { admin: true, description: "List all users and their followed maps (Admin only)", name: "listallfollows" },
    { admin: true, description: "Test map notification system (Admin only)", name: "testnotify",
        options: opt => opt.setName("map").setDescription("Map name to test").setRequired(true) },
    { admin: true, description: "Remove all follows for a user (Admin only)", name: "removeuser",
        options: opt => opt.setName("userid").setDescription("Discord user ID").setRequired(true) }
]);

/**
 * Build one definition into its Discord command payload.
 * @param {{admin: boolean, description: string, name: string, options?: Function}} def - Command definition
 * @returns {import('discord.js').RESTPostAPIChatInputApplicationCommandsJSONBody} - Command payload
 */
function buildCommand(def) {
    const builder = new SlashCommandBuilder()
        .setName(def.name)
        .setDescription(def.description);

    // Hide admin commands from everyone Discord has not been told may use them.
    // The dispatcher still checks the role itself; this only trims the picker.
    if (def.admin) {
        builder.setDefaultMemberPermissions(0);
    }
    if (def.options) {
        builder.addStringOption(def.options);
    }

    return builder.toJSON();
}

/**
 * Build every command in the shape the registration endpoint takes.
 * @returns {Array<import('discord.js').RESTPostAPIChatInputApplicationCommandsJSONBody>} - Command payloads
 */
export function buildSlashCommands() {
    return COMMAND_DEFINITIONS.map(buildCommand);
}

/**
 * Render a command's usage line, reading the options back off the built payload
 * rather than restating them: required renders as `<name>`, optional as `[name]`.
 * @param {{admin: boolean, description: string, name: string, options?: Function}} def - Command definition
 * @returns {string} - e.g. `/players [server]`
 */
function formatUsage(def) {
    const options = buildCommand(def).options ?? [];

    return [`/${def.name}`, ...options.map(opt => (opt.required ? `<${opt.name}>` : `[${opt.name}]`))].join(" ");
}

/**
 * Usage lines and descriptions for /help.
 * @param {boolean} includeAdmin - Whether to list the admin-only commands
 * @returns {Array<{description: string, usage: string}>} - One entry per listed command
 */
export function getHelpEntries(includeAdmin) {
    return COMMAND_DEFINITIONS
        .filter(def => includeAdmin || !def.admin)
        .map(def => ({ description: def.description, usage: formatUsage(def) }));
}
