/**
 * Admin slash command handlers
 * Handles /check, /listallfollows, /testnotify, /removeuser, and /mem commands
 */

import { EmbedBuilder, MessageFlags } from "discord.js";

import { CONFIG_VALUES, config } from "../config/index.js";
import { getAllFollows, hasMap, unfollowAll } from "../db/index.js";
import { discordIdSchema, mapNameSchema } from "../schemas/validationSchemas.js";
import { checkRateLimit } from "../services/cacheService.js";
import { notifyUsers } from "../services/notificationService.js";
import { getInfo, getServerByKeyword } from "../services/serverService.js";
import { escapeForDiscord, escapeList } from "../utils/discordEscape.js";
import { getMapImage } from "../utils/mapUtils.js";
import { validateServerInput } from "../utils/validation.js";
import { validateWithZod } from "../utils/zodValidator.js";

/**
 * Handle /check slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashCheck(interaction) {
    const input = interaction.options.getString("server");

    const rateLimitResult = checkRateLimit(interaction.user.id, "ipCheck", CONFIG_VALUES.IP_CHECK_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before checking another server.`, flags: MessageFlags.Ephemeral });
    }

    if (!input) {
        return interaction.reply({ content: "Please enter a server IP address, domain name, or keyword.", flags: MessageFlags.Ephemeral });
    }

    const validation = validateServerInput(input, getServerByKeyword);
    if (!validation.valid) {
        return interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
    }

    // Everything above is instant, so it still fits in Discord's 3 second reply
    // deadline. The GameDig query below does not: an unreachable host works through
    // GAMEDIG_MAX_RETRIES first. Defer here to trade that deadline for the 15 minute
    // editReply window. Deferred publicly, to match the public result embed.
    await interaction.deferReply();

    const embed = validation.type === "keyword"
        ? await checkServer(validation.value.server)
        : await checkIP(validation);

    if (!embed) {
        return interaction.editReply({ content: "The server is unavailable." });
    }

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Check a server by keyword from servers.json
 * @param {Object} server - The server object from servers.json
 * @returns {Promise<EmbedBuilder|false>} - Discord embed or false if unavailable
 */
async function checkServer(server) {
    // Get server info using getInfo()
    const serverInfo = await getInfo(server, 0);

    if (!serverInfo.online) return false;

    // Get the map image
    const image = getMapImage(serverInfo.map);

    // Create the embed with the server data
    // Use centralized escapeForDiscord which escapes backslashes FIRST (prevents injection)
    const embed = new EmbedBuilder()
        .setTitle(
            `${serverInfo.numPlayers} (${serverInfo.numBots}) / ${serverInfo.maxPlayers} players connected to ${escapeForDiscord(serverInfo.name)} on ${escapeForDiscord(serverInfo.map)}`
        )
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
        .setTimestamp(Date.now());
    if (image) embed.setImage(image);

    // Create a list of player and bot names with proper escaping
    // Use centralized escapeList which applies escapeForDiscord to each item (escapes backslashes FIRST)
    const allPlayerNames = [
        ...serverInfo.players.map((player) => player.name),
        ...serverInfo.bots.map((bot) => bot.name)
    ];
    const list = escapeList(allPlayerNames);

    // Set the list as the embed description
    embed.setDescription(list);

    return embed;
}

/**
 * Check a server by IP address or FQDN
 * @param {Object} validation - The validation result from validateServerInput
 * @returns {Promise<EmbedBuilder|false>} - Discord embed or false if unavailable
 */
async function checkIP(validation) {
    let ip;
    let port;

    if (validation.type === "fqdn") {
        // Handle FQDN with optional port
        ip = validation.value.hostname;
        port = validation.value.port || config.serverUpdate?.defaultPort || "27015";
    } else {
        // Bare IPv4 only: validateServerInput classifies any "ip:port" input as an FQDN
        // (validateIPv4 matches a dotted quad only), so this branch never carries a port.
        ip = validation.value.ip;
        port = config.serverUpdate?.defaultPort || "27015";
    }

    // Create a server object with the necessary information for getInfo()
    const server = {
        ip: `${ip}:${port}`,
        keywords: [],
        nick: "Custom Server",
        show: true
    };

    // Get server info using getInfo()
    const serverInfo = await getInfo(server, 0);

    if (!serverInfo.online) return false;

    // Get the map image
    const image = getMapImage(serverInfo.map);

    // Create the embed with the server data
    // Use centralized escapeForDiscord which escapes backslashes FIRST (prevents injection)
    const embed = new EmbedBuilder()
        .setTitle(
            `${serverInfo.numPlayers} (${serverInfo.numBots}) / ${serverInfo.maxPlayers} players connected to ${escapeForDiscord(serverInfo.name)} on ${escapeForDiscord(serverInfo.map)}`
        )
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ iconURL: CONFIG_VALUES.FALLBACK_AVATAR, text: "Last Updated" })
        .setTimestamp(Date.now());
    if (image) embed.setImage(image);

    // Create a list of player and bot names with proper escaping
    // Use centralized escapeList which applies escapeForDiscord to each item (escapes backslashes FIRST)
    const allPlayerNames = [
        ...serverInfo.players.map((player) => player.name),
        ...serverInfo.bots.map((bot) => bot.name)
    ];
    const list = escapeList(allPlayerNames);

    // Set the list as the embed description
    embed.setDescription(list);

    return embed;
}

/**
 * Handle /listallfollows slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashListallfollows(interaction) {
    const follows = await getAllFollows();

    follows.sort((a, b) => {
        if (a.discord_id < b.discord_id) return -1;
        if (a.discord_id > b.discord_id) return 1;
        return 0;
    });

    if (!follows || follows.length === 0) {
        return interaction.reply({ content: "There are no users following any maps.", flags: MessageFlags.Ephemeral });
    }

    let list = "";
    for (const follow of follows) {
        list += `<@${follow.discord_id}>: ${follow.map_name}\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle("List of all followed maps:")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .setDescription(list);

    await interaction.reply({ embeds: [embed] });
}

/**
 * Handle /testnotify slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 * @param {Object} bot - Discord bot client
 */
export async function handleSlashTestnotify(interaction, bot) {
    // notifyUsers DMs each follower serially, which can outrun Discord's 3 second
    // reply deadline. Defer up front; every reply on this command is ephemeral, so
    // the flag carries over to each editReply below.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const map = interaction.options.getString("map");

    if (!map) {
        return interaction.editReply({ content: "Please enter a valid map name." });
    }

    // Validate map name using Zod v4 schema
    const mapValidation = validateWithZod(mapNameSchema, map, "Map name");
    if (!mapValidation.valid) {
        return interaction.editReply({ content: mapValidation.error });
    }
    const sanitizedMap = mapValidation.data;

    if (!(await hasMap(sanitizedMap))) {
        return interaction.editReply({ content: "No one is following this map." });
    }

    await notifyUsers(sanitizedMap, { ip: "0.0.0.0:27015", nick: "Test Server" }, bot);
    await interaction.editReply({ content: `Notification sent for map: ${sanitizedMap}` });
}

/**
 * Handle /removeuser slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashRemoveuser(interaction) {
    const userID = interaction.options.getString("userid");
  
    if (!userID) {
        return interaction.reply({ content: "Please enter a valid user ID.", flags: MessageFlags.Ephemeral });
    }

    // Validate Discord ID using Zod v4 schema
    const userIdValidation = validateWithZod(discordIdSchema, userID, "User ID");
    if (!userIdValidation.valid) {
        return interaction.reply({ content: userIdValidation.error, flags: MessageFlags.Ephemeral });
    }

    await unfollowAll(userIdValidation.data);
    await interaction.reply({ content: `Removed all maps from user <@${userID}>.`, flags: MessageFlags.Ephemeral });
}

/**
 * Handle /mem slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashMem(interaction) {
    const used = process.memoryUsage();
    let out = "```";
    for (const key in used) {
        out += `${key} ${Math.round((used[key] / 1024 / 1024) * 100) / 100} MB\n`;
    }
    out += "```";

    await interaction.reply({ content: out, flags: MessageFlags.Ephemeral });
}