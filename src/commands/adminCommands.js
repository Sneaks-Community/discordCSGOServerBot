/**
 * Admin slash command handlers
 * Handles /check, /listallfollows, /testnotify, /removeuser, and /mem commands
 */

import { EmbedBuilder } from "discord.js";

import { CONFIG_VALUES, config } from "../config/index.js";
import { checkRateLimit } from "../services/cacheService.js";
import { validateServerInput } from "../utils/validation.js";
import { getInfo, getServerByKeyword } from "../services/serverService.js";
import { getMapImage, getStatsPage } from "../utils/mapUtils.js";
import { getAllFollows, hasMap, unfollowAll } from "../db/index.js";
import { notifyUsers } from "../services/notificationService.js";

/**
 * Handle /check slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashCheck(interaction) {
    const input = interaction.options.getString("server");

    const rateLimitResult = checkRateLimit(interaction.user.id, "ipCheck", CONFIG_VALUES.IP_CHECK_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before checking another server.`, ephemeral: true });
    }

    if (!input) {
        return interaction.reply({ content: "Please enter a server IP address, domain name, or keyword.", ephemeral: true });
    }

    const validation = validateServerInput(input, getServerByKeyword);
    if (!validation.valid) {
        return interaction.reply({ content: validation.error, ephemeral: true });
    }

    let embed;
    if (validation.type === "keyword") {
        // It's a keyword from servers.json
        embed = await checkServer(validation.value.server);
    } else {
        // It's an IP or FQDN
        embed = await checkIP(input, validation);
    }

    if (!embed) {
        return interaction.reply({ content: "The server is unavailable.", ephemeral: true });
    }

    await interaction.reply({ embeds: [embed] });
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
    const embed = new EmbedBuilder()
        .setTitle(
            `${serverInfo.numPlayers} (${serverInfo.numBots}) / ${serverInfo.maxPlayers} players connected to ${serverInfo.name} on ${serverInfo.map}`.replace(
                /_/g,
                "\\_"
            )
        )
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
        .setTimestamp(Date.now());
    if (image) embed.setImage(image);

    // Create a list of players and bots
    let list = "";
    for (const player of serverInfo.players) {
        list += `${player.name}\n`;
    }
    for (const bot of serverInfo.bots) {
        list += `${bot.name}\n`;
    }

    // Sanitize the list for Discord and remove undefined entries
    list = list
        .replace(/`/g, "'")
        .replace(/\*/g, "\\*")
        .replace(/_/g, "\\_")
        .replace(/undefined\n/g, "");

    // Set the list as the embed description
    embed.setDescription(list);

    return embed;
}

/**
 * Check a server by IP address or FQDN
 * @param {string} input - The IP or FQDN input
 * @param {Object} validation - The validation result from validateServerInput
 * @returns {Promise<EmbedBuilder|false>} - Discord embed or false if unavailable
 */
async function checkIP(input, validation) {
    let ip;
    let port;

    if (validation.type === "fqdn") {
        // Handle FQDN with optional port
        ip = validation.value.hostname;
        port = validation.value.port || config.serverUpdate?.defaultPort || "27015";
    } else {
        // Handle IPv4 with optional port
        if (input.includes(":")) {
            [ip, port] = input.split(":");
        } else {
            ip = input;
            port = config.serverUpdate?.defaultPort || "27015";
        }
    }

    // Create a server object with the necessary information for getInfo()
    const server = {
        ip: `${ip}:${port}`,
        nick: "Custom Server",
        show: true,
        keywords: []
    };

    // Get server info using getInfo()
    const serverInfo = await getInfo(server, 0);

    if (!serverInfo.online) return false;

    // Get the map image
    const image = getMapImage(serverInfo.map);

    // Create the embed with the server data
    const embed = new EmbedBuilder()
        .setTitle(
            `${serverInfo.numPlayers} (${serverInfo.numBots}) / ${serverInfo.maxPlayers} players connected to ${serverInfo.name} on ${serverInfo.map}`.replace(
                /_/g,
                "\\_"
            )
        )
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
        .setTimestamp(Date.now());
    if (image) embed.setImage(image);

    // Create a list of players and bots
    let list = "";
    for (const player of serverInfo.players) {
        list += `${player.name}\n`;
    }
    for (const bot of serverInfo.bots) {
        list += `${bot.name}\n`;
    }

    // Sanitize the list for Discord and remove undefined entries
    list = list
        .replace(/`/g, "'")
        .replace(/\*/g, "\\*")
        .replace(/_/g, "\\_")
        .replace(/undefined\n/g, "");

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
        return interaction.reply({ content: "There are no users following any maps.", ephemeral: true });
    }

    let list = "";
    for (const follow of follows) {
        const stats = getStatsPage(follow.map_name);
        if (stats) {
            list += `<@${follow.discord_id}>: [${follow.map_name}](${stats})\n`;
        } else {
            list += `<@${follow.discord_id}>: ${follow.map_name}\n`;
        }
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
 * @param {Object} logChannel - Log channel for notifications
 */
export async function handleSlashTestnotify(interaction, bot, logChannel) {
    const map = interaction.options.getString("map").toLowerCase();
  
    if (!map) {
        return interaction.reply({ content: "Please enter a valid map name.", ephemeral: true });
    }

    if (!(await hasMap(map))) {
        return interaction.reply({ content: "No one is following this map.", ephemeral: true });
    }

    await notifyUsers(map, { nick: "Test Server", ip: "0.0.0.0:27015" }, bot, logChannel);
    await interaction.reply({ content: `Notification sent for map: ${map}`, ephemeral: true });
}

/**
 * Handle /removeuser slash command (Admin only)
 * @param {Object} interaction - Discord interaction object
 */
export async function handleSlashRemoveuser(interaction) {
    const userID = interaction.options.getString("userid");
  
    if (!userID) {
        return interaction.reply({ content: "Please enter a valid user ID.", ephemeral: true });
    }

    await unfollowAll(userID);
    await interaction.reply({ content: `Removed all maps from user <@${userID}>.`, ephemeral: true });
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

    await interaction.reply({ content: out, ephemeral: true });
}