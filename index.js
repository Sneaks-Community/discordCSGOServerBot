import Discord, { GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } from "discord.js";
import { GameDig } from "gamedig";
import pLimit from "p-limit";

import config from "./config.json" with { type: "json" };
import serverObject from "./servers.json" with { type: "json" };
import { initDB, followMap, unfollowMap, getAllFollows, getUserFollows, isFollowingMap, getUsersFollowingMap, hasMap, unfollowAll, closeDB } from "./db.js";

// Helper function to convert seconds to milliseconds
function secondsToMilliseconds(seconds) {
    return seconds * 1000;
}

// Configuration values - using seconds for better readability, converting to milliseconds where needed
const CONFIG_VALUES = {
    EMBED_UPDATE_INTERVAL_MS: secondsToMilliseconds(config.serverUpdate.intervalSeconds || 90),
    MAP_CHECK_INTERVAL_MS: secondsToMilliseconds(config.serverUpdate.mapCheckIntervalSeconds || 91),
    MAP_FOLLOW_TIMEOUT_MS: secondsToMilliseconds(config.follow?.timeoutSeconds || 30),
    MAX_CONCURRENT_SERVER_QUERIES: config.serverUpdate.maxConcurrentQueries || 10,
    USER_CACHE_TTL: secondsToMilliseconds(config.cache?.userCacheTTLSeconds || 300),
    MAP_IMAGE_CACHE_TTL: secondsToMilliseconds(config.cache?.mapImageCacheTTLSeconds || 86400),
    RETRY_MAX_RETRIES: config.retry?.maxRetries || 3,
    RETRY_BASE_DELAY_MS: secondsToMilliseconds(config.retry?.baseDelaySeconds || 1),
    GAMEDIG_MAX_RETRIES: config.gamedig?.defaultMaxRetries || 4,
    EMBED_COLOR: config.embedsConfig?.color || 7980240,
    FALLBACK_AVATAR: config.images?.fallbackAvatar || "https://i.imgur.com/cBiDnMi.png",
    OFFLINE_SERVER_IMAGE: config.images?.offlineServer || "https://i.imgur.com/WnS0Biz.png",
    // Rate limiting configuration
    FOLLOW_RATE_LIMIT_PER_MINUTE: config.rateLimit?.followPerMinute || 5,
    UNFOLLOW_RATE_LIMIT_PER_MINUTE: config.rateLimit?.unfollowPerMinute || 5,
    IP_CHECK_RATE_LIMIT_PER_MINUTE: config.rateLimit?.ipCheckPerMinute || 10
};

// Rate limiting tracking - stores timestamp arrays per user/command
const userActionRateLimits = new Map();

/**
 * Check if a user has exceeded their rate limit for a specific action
 * @param {string} userId - The Discord user ID
 * @param {string} action - The action type (follow, unfollow, ipCheck, etc.)
 * @param {number} limit - Maximum actions allowed per minute
 * @returns {Object} - { allowed: boolean, retryAfter: number }
 */
function checkRateLimit(userId, action, limit) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Initialize or get existing action history for user
    if (!userActionRateLimits.has(userId)) {
        userActionRateLimits.set(userId, {});
    }
    
    const userActions = userActionRateLimits.get(userId);
    
    if (!userActions[action]) {
        userActions[action] = [];
    }
    
    // Filter out actions older than 1 minute
    userActions[action] = userActions[action].filter(timestamp => timestamp > oneMinuteAgo);
    
    // Check if limit exceeded
    if (userActions[action].length >= limit) {
        const oldestAction = userActions[action][0];
        const retryAfter = Math.ceil((oldestAction + 60000 - now) / 1000);
        return { allowed: false, retryAfter };
    }
    
    // Record this action
    userActions[action].push(now);
    return { allowed: true, retryAfter: 0 };
}

/**
 * Validate IPv4 address format
 * @param {string} ip - The IP address to validate
 * @returns {Object} - { valid: boolean, error?: string, isPrivate?: boolean }
 */
function validateIPv4(ip) {
    // IPv4 regex pattern
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Regex);
    
    if (!match) {
        return { valid: false, error: "Invalid IPv4 address format" };
    }
    
    // Check each octet is in valid range (0-255)
    const octets = match.slice(1).map(Number);
    for (const octet of octets) {
        if (octet < 0 || octet > 255) {
            return { valid: false, error: "Invalid IPv4 address: octets must be 0-255" };
        }
    }
    
    // Check for private/reserved IP ranges
    const isPrivate =
        octets[0] === 10 || // 10.0.0.0/8
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || // 172.16.0.0/12
        (octets[0] === 192 && octets[1] === 168) || // 192.168.0.0/16
        (octets[0] === 127) || // 127.0.0.0/8 (loopback)
        (octets[0] === 0) || // 0.0.0.0/8
        (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) || // 100.64.0.0/10 (CGNAT)
        (octets[0] === 169 && octets[1] === 254) || // 169.254.0.0/16 (link-local)
        (octets[0] === 198 && octets[1] >= 18 && octets[1] <= 19); // 198.18.0.0/15 (benchmark)
    
    return { valid: true, isPrivate };
}

/**
 * Validate IPv6 address format
 * @param {string} ip - The IPv6 address to validate
 * @returns {Object} - { valid: boolean, error?: string, isPrivate?: boolean }
 */
function validateIPv6(ip) {
    // Simplified IPv6 validation (allows common formats)
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    
    if (!ipv6Regex.test(ip)) {
        // Try expanded format with ::
        const ipv6ExpandedRegex = /^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/;
        if (!ipv6ExpandedRegex.test(ip)) {
            return { valid: false, error: "Invalid IPv6 address format" };
        }
    }
    
    // Check for private IPv6 ranges (simplified check)
    const isPrivate = ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd"); // Unique local addresses
    
    return { valid: true, isPrivate };
}

/**
 * Validate IP address (IPv4 or IPv6)
 * @param {string} ip - The IP address to validate
 * @returns {Object} - { valid: boolean, error?: string, isPrivate?: boolean }
 */
function validateIP(ip) {
    if (!ip || typeof ip !== "string") {
        return { valid: false, error: "Invalid IP: must be a non-empty string" };
    }
    
    const trimmedIp = ip.trim();
    
    // Try IPv4 first
    const ipv4Result = validateIPv4(trimmedIp);
    if (ipv4Result.valid) {
        return ipv4Result;
    }
    
    // Try IPv6
    const ipv6Result = validateIPv6(trimmedIp);
    if (ipv6Result.valid) {
        return ipv6Result;
    }
    
    return { valid: false, error: "Invalid IP address format" };
}

// Discord v14 imports

// Create bot client with v14 intents
const bot = new Discord.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ]
});

// Slash command definitions
const slashCommands = [
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
        .setDescription("Check server status by IP (Admin only)")
        .addStringOption(option =>
            option.setName("ip")
                .setDescription("Server IP address")
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

// Function to register slash commands
async function registerSlashCommands() {
    try {
        const rest = new REST({ version: "10" }).setToken(config.discord.token);
    
        // Register commands globally (or for specific guild)
        if (config.discord?.guildID) {
            // Guild commands update instantly (good for development)
            await rest.put(
                Routes.applicationGuildCommands(bot.application.id, config.discord.guildID),
                { body: slashCommands }
            );
            console.log(`Successfully registered ${slashCommands.length} guild slash commands`);
        } else {
            // Global commands take up to an hour to update
            await rest.put(
                Routes.applicationCommands(bot.application.id),
                { body: slashCommands }
            );
            console.log(`Successfully registered ${slashCommands.length} global slash commands`);
        }
    } catch (error) {
        console.error("Error registering slash commands:", error);
    }
}

// Validate map name input - ensures map names are safe and follow CS:GO conventions
function validateMapName(mapName) {
    // Check for empty or whitespace-only input
    if (!mapName || mapName.trim().length === 0) {
        return { valid: false, error: "Map name cannot be empty" };
    }

    // Check for mentions (users, roles, everyone)
    if (
        mapName.match(Discord.MessageMentions.USERS_PATTERN) ||
    mapName.match(Discord.MessageMentions.ROLES_PATTERN) ||
    mapName.match(Discord.MessageMentions.EVERYONE_PATTERN)
    ) {
        return { valid: false, error: "Map name cannot contain mentions" };
    }

    // Validate map name format - CS:GO map names typically start with specific prefixes
    // and contain only alphanumeric characters, underscores, and hyphens
    const mapNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!mapNameRegex.test(mapName)) {
        return { valid: false, error: "Map name contains invalid characters" };
    }

    // Ensure map name is not too long (CS:GO limit is typically 64 characters)
    if (mapName.length > 64) {
        return { valid: false, error: "Map name is too long (max 64 characters)" };
    }

    return { valid: true };
}

// Map type configuration for URL generation - uses optional config URLs
const MAP_CONFIG = {
    surf: {
        prefixes: ["surf_"],
        statsUrl: (map) => config.mapUrls?.surf?.stats || `https://snksrv.com/surfstats/?view=map&name=${map}`,
        imageUrl: (map) => config.mapUrls?.surf?.image || `https://bans.snksrv.com/images/maps/${map}.jpg`,
        displayFormat: (map) => `[${map}](https://snksrv.com/surfstats/?view=map&name=${map})`
    },
    kz: {
        prefixes: ["bkz_", "kz_", "kzpro_", "skz_", "vnl_", "xc_"],
        statsUrl: (map) => config.mapUrls?.kz?.stats || `https://snksrv.com/kzstats/#/maps/${map}/`,
        imageUrl: (map) => config.mapUrls?.kz?.image || `https://raw.githubusercontent.com/KZGlobalTeam/map-images/public/images/${map}.jpg`,
        displayFormat: (map) => `[${map}](https://snksrv.com/kzstats/#/maps/${map}/)`
    },
    bhop: {
        prefixes: ["bhop"],
        statsUrl: (map) => config.mapUrls?.bhop?.stats || `https://snksrv.com/bhopstats/index.php?map=${map}`,
        imageUrl: (map) => config.mapUrls?.bhop?.image || `https://bans.snksrv.com/images/maps/${map}.jpg`,
        displayFormat: (map) => `[${map}](https://snksrv.com/bhopstats/index.php?map=${map})`
    }
};

function getMapType(mapName) {
    // Determine the map type based on prefix
    for (const [type, config] of Object.entries(MAP_CONFIG)) {
        if (config.prefixes.some((prefix) => mapName.startsWith(prefix))) {
            return type;
        }
    }
    return null;
}

function getWebsite(mapName) {
    // Determine the appropriate website URL based on the map prefix
    const mapType = getMapType(mapName);
    if (mapType && MAP_CONFIG[mapType].displayFormat) {
        return MAP_CONFIG[mapType].displayFormat(mapName);
    }
    // Return the map name if no matching prefix is found
    return mapName;
}

function getStatsPage(mapName) {
    // Returns the stats page URL for the given map name
    const mapType = getMapType(mapName);
    if (mapType && MAP_CONFIG[mapType].statsUrl) {
        return MAP_CONFIG[mapType].statsUrl(mapName);
    }
    return false;
}

function getMapImage(mapName) {
    // Returns the map image URL for the given map name
    const mapType = getMapType(mapName);
    if (mapType && MAP_CONFIG[mapType].imageUrl) {
        return MAP_CONFIG[mapType].imageUrl(mapName);
    }
    return false;
}

function isEmpty(obj) {
    // Checks if bot has started - if empty, bot is still starting
    return Object.keys(obj).length === 0;
}

// Retry logic with exponential backoff
async function withRetry(fn, maxRetries = CONFIG_VALUES.RETRY_MAX_RETRIES, baseDelay = CONFIG_VALUES.RETRY_BASE_DELAY_MS) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = baseDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// User cache for reducing API calls
const userCache = new Map();

async function getCachedUser(userId) {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CONFIG_VALUES.USER_CACHE_TTL) {
        return cached.user;
    }
    const user = await bot.users.fetch(userId);
    userCache.set(userId, { user, timestamp: Date.now() });
    return user;
}

// Clear cache periodically (run every 5 minutes regardless of TTL)
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of userCache.entries()) {
        if (now - value.timestamp > CONFIG_VALUES.USER_CACHE_TTL) {
            userCache.delete(key);
        }
    }
}, 300000); // 5 minutes

// Clear rate limit map periodically to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [userId, actions] of userActionRateLimits.entries()) {
        let hasValidActions = false;
        for (const action of Object.keys(actions)) {
            actions[action] = actions[action].filter(ts => now - ts < 60000);
            if (actions[action].length === 0) {
                delete actions[action];
            } else {
                hasValidActions = true;
            }
        }
        if (!hasValidActions) {
            userActionRateLimits.delete(userId);
        }
    }
}, 300000); // Clean every 5 minutes

async function keywordToServer(keyword) {
    // Takes keywords and returns server obj
    for (const server of Object.values(gData)) {
        if (server.keywords.includes(keyword) || String(server.index) === keyword) {
            return server;
        }
    }
    return null;
}

function playerListEmbed(server) {
    let embed;

    if (server.online) {
    // Create an embed for the online server using EmbedBuilder
        embed = new EmbedBuilder()
            .setTitle(
                `${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} players connected to ${server.name} on ${server.map}`.replace(/_/g, "\\_")
            )
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
            .setTimestamp(Date.now());

        // Generate a list of player names
        let list = server.players.map((player) => player.name).join("\n");
        let botList = server.bots.map((bot) => bot.name).join("\n");
        list += botList;

        // Escape special characters for Discord and remove connecting players
        list = list
            .replace(/`/g, "'")
            .replace(/\*/g, "\\*")
            .replace(/_/g, "\\_")
            .replace(/undefined\n/g, "");

        embed.setDescription(list);
    } else {
    // Create an embed for the offline server
        embed = new EmbedBuilder()
            .setTitle(`${server.name} is currently unavailable.`)
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
            .setTimestamp(Date.now())
            .setImage(CONFIG_VALUES.OFFLINE_SERVER_IMAGE);
    }

    return embed;
}

function makeServerList() {
    // Create a server list embed for public commands
    let embed = new EmbedBuilder()
        .setTitle("Please specify what server you want to check.")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
        .setTimestamp(Date.now());

    // Generate the server list
    let list = Object.values(gData)
        .map((server) => {
            if (server.online) {
                return `${server.index}: **__${server.name}__**: ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers} on ${getWebsite(server.map)}`;
            } else {
                return `${server.index}: **__${server.name}__**: is currently unavailable.`;
            }
        })
        .join("\n");

    embed.setDescription(list);

    return embed;
}

// Creates a map embed with optional server information
function makeMapEmbed(mapName, server) {
    // Get the map image and stats page URLs
    const image = getMapImage(mapName);
    const stats = getStatsPage(mapName);

    // Create a new Discord EmbedBuilder instance
    const embed = new EmbedBuilder().setColor(CONFIG_VALUES.EMBED_COLOR).setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR }).setTimestamp(Date.now());

    // Set the embed URL if a stats page is available
    if (stats) {
        embed.setURL(stats);
    }

    // Set the embed image if an image is available
    if (image) {
        embed.setImage(image);
    }

    // Set the embed title based on whether a server is provided
    if (server) {
        embed.setTitle(`${server.name} is currently on ${mapName}`.replace(/_/g, "\\_"));
    } else {
        embed.setTitle(`${mapName} stats`.replace(/_/g, "\\_"));
    }

    return embed;
}

async function addTrash(msg, om) {
    //react a trash can and if the member reacts it delete the message
    try {
        await msg.react("🗑️");
        const filter = (reaction, user) => reaction.emoji.name === "🗑️" && user.id === om.author.id;
        const collector = msg.createReactionCollector({
            filter,
            time: CONFIG_VALUES.MAP_FOLLOW_TIMEOUT_MS,
            max: 1
        });

        // Track collector for cleanup
        let collectorStopped = false;

        collector.on("collect", async (r) => {
            try {
                await r.message.delete();
                if (r.message.channel.type !== "DM") {
                    await om.delete().catch(() => {});
                }
            } catch {
                // Message may already be deleted
                console.debug("Message already deleted in addTrash collector");
            } finally {
                if (!collectorStopped) {
                    collectorStopped = true;
                    collector.stop();
                }
            }
        });

        collector.on("end", () => {
            // Collector ended naturally (timeout) or by limit
            // Ensure cleanup happens even if collector was already stopped
            if (!collectorStopped) {
                collectorStopped = true;
            }
        });

        collector.on("error", (err) => {
            // Handle collector errors to prevent memory leaks
            console.error("Reaction collector error in addTrash:", err);
            if (!collectorStopped) {
                collectorStopped = true;
                collector.stop();
            }
        });

        // Ensure collector is cleaned up if message is deleted externally
        msg.delete().catch(() => {}).finally(() => {
            if (!collectorStopped) {
                collectorStopped = true;
                collector.stop();
            }
        });
    } catch (e) {
    // Failed to add reaction or create collector
        console.error("Failed to add trash reaction:", e);
    }
}

// Initialize logChannel with config values
let logChannel = null;

bot.on("ready", async () => {
    console.log("Started as " + bot.user.tag);
    bot.user.setActivity("/follow <map> in #bot-commands");

    // Initialize logChannel with config values
    const guild = bot.guilds.cache.get(config.logging.guildID);
    if (guild) {
        logChannel = guild.channels.cache.get(config.logging.channelID);
        if (!logChannel) {
            console.warn(`Log channel ${config.logging.channelID} not found in guild ${config.logging.guildID}`);
        }
    } else {
        console.warn(`Guild ${config.logging.guildID} not found`);
    }

    // Register slash commands
    await registerSlashCommands();

    // Start the interval function
    intervalFunction();

    setInterval(intervalFunction, CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS); //starts embed update loop
});

// Initialize database before logging in
await initDB();

bot.login(config.discord.token).catch(err => {
    console.error("Failed to login to Discord:", err.message);
    process.exit(1);
});

let gData = {};

const allowedDevs = config.security.adminUserIds;

async function intervalFunction() {
    try {
        await refresh(serverObject);
    } catch (error) {
        console.error("Failed to refresh server data:", error);
        return; // Skip embed update if refresh fails
    }
    const embed = await makeEmbed();

    // Process embeds in parallel with retry logic for faster updates
    await Promise.all(
        config.embeds.map(async (e) => {
            try {
                await withRetry(async () => {
                    const channel = await bot.channels.fetch(e.channelID);
                    const message = await channel.messages.fetch(e.messageID);
                    await message.edit({ content: "‎", embeds: [embed] });
                });
            } catch (error) {
                console.error(`Failed to update embed in channel ${e.channelID} after retries:`, error);
            }
        })
    );
}

async function refresh(servers) {
    // Refreshes all servers with connection limits for better performance
    const serverEntries = Object.entries(servers);
  
    // Create a limiter for concurrent server queries
    const limit = pLimit(CONFIG_VALUES.MAX_CONCURRENT_SERVER_QUERIES);
  
    const results = await Promise.all(
        serverEntries.map(([name, server], index) => 
            limit(async () => {
                try {
                    const data = await getInfo(server, index + 1);
                    return [name, data];
                } catch (error) {
                    console.error(`Failed to query ${name}:`, error);
                    // Return minimal data on error
                    return [name, { online: false, name: server.nick, keywords: server.keywords, index: index + 1 }];
                }
            })
        )
    );

    gData = Object.fromEntries(results); //overwrites Global data var
}

async function getInfo(server, index) {
    // Get IP and port from the server object
    const [ip, port] = server.ip.split(":");

    let valid = true;

    // Query the server using Gamedig
    const res = await GameDig.query({
        type: server.protocol || "csgo",
        host: ip,
        port: port,
        maxRetries: CONFIG_VALUES.GAMEDIG_MAX_RETRIES
    }).catch(() => {
        valid = false;
    });

    let data;

    if (valid) {
    // If the server is valid, populate the data object with server information
        data = {
            online: true,
            name: server.nick, // Short nickname
            fullIP: res.connect, // String with ip:port
            map: res.map, // Current map
            maxPlayers: res.maxplayers,
            players: res.players, // Players array {name, score, time}
            bots: res.bots, // Bots array {name, score, time}
            numPlayers: res.players.length, // int (gamedig v5.x API)
            numBots: res.bots.length, // int (gamedig v5.x API)
            show: server.show, // bool to print server in embed
            keywords: server.keywords, // array of keywords for --players command
            index: index
        };
    } else {
    // If the server is not valid, populate the data object with minimal information
        data = {
            online: false,
            name: server.nick,
            keywords: server.keywords,
            index: index
        };
    }

    return data;
}

function makeEmbed() {
    // Create a new Discord embed with the title and other details using EmbedBuilder
    const embed = new EmbedBuilder()
        .setTitle("Server List")
        .setDescription("This list is updated every 1.5 minutes.")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
        .setTimestamp(Date.now());

    // Iterate through the servers in gData and add server details to the embed
    for (const server of Object.values(gData)) {
        if (!server.online) {
            // If the server is offline, add a field indicating it's not available
            embed.addFields({
                name: server.name,
                value: "**Server is not available.**",
                inline: true
            });
            continue;
        }

        if (!server.show) continue; // Skip servers that shouldn't be displayed

        // Add a field for the online server with player, map, and IP details
        embed.addFields({
            name: server.name,
            value: `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}\n**__Map:__** ${getWebsite(server.map)}\n**__IP:__** ${
                server.fullIP
            }`,
            inline: true
        });
    }

    return embed;
}

// Handle slash command interactions
bot.on("interactionCreate", async (interaction) => {
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
            await handleSlashFollow(interaction);
        } else if (commandName === "unfollow") {
            await handleSlashUnfollow(interaction);
        } else if (commandName === "listfollows") {
            await handleSlashListfollows(interaction);
        } else if (commandName === "help") {
            await handleSlashHelp(interaction);
        } else if (commandName === "ping") {
            await interaction.reply({ content: "🏓 Pong!", ephemeral: true });
        } else if (commandName === "version") {
            await interaction.reply({ content: require("./package.json").version, ephemeral: true });
        }
        // Handle admin commands
        else if (commandName === "check" && isAdmin) {
            await handleSlashCheck(interaction);
        } else if (commandName === "listallfollows" && isAdmin) {
            await handleSlashListallfollows(interaction);
        } else if (commandName === "testnotify" && isAdmin) {
            await handleSlashTestnotify(interaction);
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
});

// Slash command handlers
async function handleSlashPlayers(interaction) {
    if (isEmpty(gData)) {
        return interaction.reply({ content: "Please Wait. The bot is starting.", ephemeral: true });
    }

    const serverInput = interaction.options.getString("server");
  
    if (!serverInput) {
        const embed = await makeServerList();
        return interaction.reply({ embeds: [embed] });
    }

    const server = await keywordToServer(serverInput.toLowerCase());
  
    if (!server) {
        return interaction.reply({ content: "Please enter a valid server.", ephemeral: true });
    }

    const embed = await playerListEmbed(server);
    await interaction.reply({ embeds: [embed] });
}

async function handleSlashMap(interaction) {
    if (isEmpty(gData)) {
        return interaction.reply({ content: "Please Wait. The bot is starting.", ephemeral: true });
    }

    const serverInput = interaction.options.getString("server");
  
    if (!serverInput) {
        const embed = await makeServerList();
        return interaction.reply({ embeds: [embed] });
    }

    const server = await keywordToServer(serverInput.toLowerCase());
  
    if (!server) {
        const isMap = getMapImage(serverInput);
        let res;
    
        if (isMap) {
            res = await fetch(isMap, { method: "HEAD" });
        }
    
        if (!isMap || !res?.ok) {
            return interaction.reply({ content: "Please choose a valid server/map.", ephemeral: true });
        }
    
        const embed = makeMapEmbed(serverInput);
        return interaction.reply({ embeds: [embed] });
    }

    let embed;
    if (server.online) {
        embed = makeMapEmbed(server.map, server);
    } else {
        embed = new EmbedBuilder()
            .setTitle(`${server.name} is currently unavailable.`)
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
            .setTimestamp(Date.now())
            .setImage(CONFIG_VALUES.OFFLINE_SERVER_IMAGE);
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleSlashKeywords(interaction) {
    let list = "";
    for (const server of Object.values(serverObject)) {
        list += `**${server.nick}:**\n`;
        for (const k of server.keywords) {
            list += `\t${k}`;
        }
        list += "\n";
    }
    await interaction.reply({ content: list });
}

async function handleSlashFollow(interaction) {
    const map = interaction.options.getString("map").toLowerCase();

    const rateLimitResult = checkRateLimit(interaction.user.id, "follow", CONFIG_VALUES.FOLLOW_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before following another map.`, ephemeral: true });
    }

    const validation = validateMapName(map);
    if (!validation.valid) {
        return interaction.reply({ content: validation.error, ephemeral: true });
    }

    if (await isFollowingMap(interaction.user.id, map)) {
        return interaction.reply({ content: "You are already following this map.", ephemeral: true });
    }

    await followMap(interaction.user.id, map);

    await interaction.reply({ content: `You are now following ${map}. You will be notified when the map comes on a server.`, ephemeral: true });

    console.log(`${interaction.user.tag} followed map ${map}`);

    const logEmbed = new EmbedBuilder()
        .setTitle("User Followed Map")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .addFields({ name: "User", value: interaction.user.toString() }, { name: "Map", value: map })
        .setThumbnail(interaction.user.displayAvatarURL())
        .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL()
        });

    if (logChannel) {
        logChannel.send({ embeds: [logEmbed] });
    }
}

async function handleSlashUnfollow(interaction) {
    const map = interaction.options.getString("map").toLowerCase();

    const rateLimitResult = checkRateLimit(interaction.user.id, "unfollow", CONFIG_VALUES.UNFOLLOW_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before unfollowing another map.`, ephemeral: true });
    }

    const validation = validateMapName(map);
    if (!validation.valid) {
        return interaction.reply({ content: validation.error, ephemeral: true });
    }

    if (map === "all") {
        await unfollowAll(interaction.user.id);
        await interaction.reply({ content: "You are no longer following any maps.", ephemeral: true });
        console.log(`${interaction.user.tag} unfollowed all maps`);
    } else {
        if (!(await isFollowingMap(interaction.user.id, map))) {
            return interaction.reply({ content: "You are not following this map. Use `/listfollows` to see a list of maps you are following.", ephemeral: true });
        }

        await unfollowMap(interaction.user.id, map);
        await interaction.reply({ content: `You are no longer following ${map}.`, ephemeral: true });
        console.log(`${interaction.user.tag} unfollowed map ${map}`);
    }

    const logEmbed = new EmbedBuilder()
        .setTitle("User Unfollowed Map")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .addFields({ name: "User", value: interaction.user.toString() }, { name: "Map", value: map })
        .setThumbnail(interaction.user.displayAvatarURL())
        .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL()
        });

    if (logChannel) {
        logChannel.send({ embeds: [logEmbed] });
    }
}

async function handleSlashListfollows(interaction) {
    const follows = await getUserFollows(interaction.user.id);
  
    if (follows.length === 0) {
        return interaction.reply({ content: "You are not following any maps.", ephemeral: true });
    }

    let list = "";
    for (const follow of follows) {
        const stats = getStatsPage(follow.map_name);
        if (stats) {
            list += `[${follow.map_name}](${stats})\n`;
        } else {
            list += `${follow.map_name}\n`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle("List of maps you are following:")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .setDescription(list);

    await interaction.reply({ embeds: [embed] });
}

async function handleSlashHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle("List of commands")
        .setColor(CONFIG_VALUES.EMBED_COLOR)
        .setTimestamp(Date.now())
        .addFields(
            { name: "/players [server]", value: "Show players on a server" },
            { name: "/map [server]", value: "Show current map on a server or map stats" },
            { name: "/keywords", value: "List all available server keywords" },
            { name: "/follow <map>", value: "Follow a map to receive DM notifications" },
            { name: "/unfollow <map|all>", value: "Stop following a map or all maps" },
            { name: "/listfollows", value: "List all maps you are following" },
            { name: "/ping", value: "Check bot latency" },
            { name: "/version", value: "Show bot version" }
        );

    await interaction.reply({ embeds: [embed] });
}

async function handleSlashCheck(interaction) {
    const ip = interaction.options.getString("ip");

    const rateLimitResult = checkRateLimit(interaction.user.id, "ipCheck", CONFIG_VALUES.IP_CHECK_RATE_LIMIT_PER_MINUTE);
    if (!rateLimitResult.allowed) {
        return interaction.reply({ content: `Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before checking another IP.`, ephemeral: true });
    }

    if (!ip) {
        return interaction.reply({ content: "Please enter an IP address.", ephemeral: true });
    }

    const ipValidation = validateIP(ip);
    if (!ipValidation.valid) {
        return interaction.reply({ content: `Invalid IP address: ${ipValidation.error}`, ephemeral: true });
    }

    if (ipValidation.isPrivate) {
        return interaction.reply({ content: "Private IP addresses are not allowed for security reasons.", ephemeral: true });
    }

    const embed = await checkIP(ip);

    if (!embed) {
        return interaction.reply({ content: "The server is unavailable.", ephemeral: true });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleSlashListallfollows(interaction) {
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

async function handleSlashTestnotify(interaction) {
    const map = interaction.options.getString("map").toLowerCase();
  
    if (!map) {
        return interaction.reply({ content: "Please enter a valid map name.", ephemeral: true });
    }

    if (!(await hasMap(map))) {
        return interaction.reply({ content: "No one is following this map.", ephemeral: true });
    }

    await notifyUsers(map);
    await interaction.reply({ content: `Notification sent for map: ${map}`, ephemeral: true });
}

async function handleSlashRemoveuser(interaction) {
    const userID = interaction.options.getString("userid");
  
    if (!userID) {
        return interaction.reply({ content: "Please enter a valid user ID.", ephemeral: true });
    }

    await unfollowAll(userID);
    await interaction.reply({ content: `Removed all maps from user <@${userID}>.`, ephemeral: true });
}

async function handleSlashMem(interaction) {
    const used = process.memoryUsage();
    let out = "```";
    for (const key in used) {
        out += `${key} ${Math.round((used[key] / 1024 / 1024) * 100) / 100} MB\n`;
    }
    out += "```";

    await interaction.reply({ content: out, ephemeral: true });
}

// Keep message commands for backwards compatibility
bot.on("messageCreate", async (message) => {
    // Exit early for bot messages and non-command messages
    if (message.author.bot) return;
    if (!message.content.startsWith(config.discord.prefix) && !message.content.startsWith("—")) return;

    const args = message.content.slice(message.content.startsWith(config.discord.prefix) ? config.discord.prefix.length : 0).split(/ +/);
    const command = args.shift().toLowerCase();

    // Route to public or dev commands based on user ID
    if (allowedDevs.includes(message.author.id)) {
        await handleDevCommand(message, args, command);
    } else {
        await handlePublicCommand(message, args, command);
    }
});

async function handlePublicCommand(message, args, command) {
    if (command == "players" || command == "p") {
    // Check if gData is empty
        if (isEmpty(gData)) {
            return message.channel.send("Please Wait. The bot is starting.");
        }

        // If no arguments are provided, send the server list embed
        if (args.length === 0) {
            return message.channel.send({ embeds: [await makeServerList()] }).then((msg) => addTrash(msg, message));
        }


        // Search for the server using the provided keyword(s)
        const server = await keywordToServer(args.join(" ").toLowerCase());

        // If a valid server is found, send the player list embed
        if (!server) {
            return message.channel.send("Please enter a valid server.");
        } else {
            const embed = await playerListEmbed(server);
            message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
        }
    } else if (command == "map" || command == "m") {
    // Check if gData is empty
        if (isEmpty(gData)) {
            return message.channel.send("Please Wait. The bot is starting.");
        }

        // If no arguments are provided, send the server list embed
        if (args.length === 0) {
            return message.channel.send({ embeds: [await makeServerList()] }).then((msg) => addTrash(msg, message));
        }

        // Search for the server using the provided keyword(s)
        const server = await keywordToServer(args.join(" ").toLowerCase());

        if (!server) {
            // If no valid server is found, try searching for a map image
            const isMap = getMapImage(args[0]);
            let res;

            if (isMap) {
                res = await fetch(isMap, { method: "HEAD" });
            }

            // If no valid map image is found, return an error message
            if (!isMap || !res?.ok) {
                return message.channel.send("Please choose a valid server/map.");
            }

            // If a valid map image is found, create and send the map embed
            const embed = makeMapEmbed(args[0]);
            message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
        } else {
            let embed;

            // If a valid server is found, create and send the map embed
            if (server.online) {
                embed = makeMapEmbed(server.map, server);
            } else {
                embed = new EmbedBuilder()
                    .setTitle(`${server.name} is currently unavailable.`)
                    .setColor(CONFIG_VALUES.EMBED_COLOR)
                    .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
                    .setTimestamp(Date.now())
                    .setImage(CONFIG_VALUES.OFFLINE_SERVER_IMAGE);
            }

            message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
        }
    } else if (command === "help" || command === "commands") {
        const embed = new EmbedBuilder()
            .setTitle("List of commands")
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setTimestamp(Date.now())
            .addFields(
                {
                    name: "/players",
                    value: "`/players [server]`\nShows players on a server. Legacy: `--players/--p <server>`"
                },
                {
                    name: "/map",
                    value: "`/map [server]`\nShows current map on a server or map stats. Legacy: `--map/--m <server/map>`"
                },
                {
                    name: "/keywords",
                    value: "`/keywords`\nLists all available server keywords. Legacy: `--keywords/--keys`"
                },
                {
                    name: "/follow",
                    value: "`/follow <map>`\nFollow a map to receive DM notifications. Legacy: `--follow/--f <map>`"
                },
                {
                    name: "/unfollow",
                    value: "`/unfollow <map|all>`\nStop following a map or all maps. Legacy: `--unfollow/--uf <map>/all`"
                },
                {
                    name: "/listfollows",
                    value: "`/listfollows`\nList all maps you are following. Legacy: `--listfollows/--lf`"
                },
                {
                    name: "/ping",
                    value: "`/ping`\nCheck bot latency. Legacy: `--ping`"
                },
                {
                    name: "/version",
                    value: "`/version`\nShow bot version. Legacy: `--v/--version`"
                }
            );

        message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
    } else if (command === "keywords" || command === "keys") {
        let list = "";

        for (const server of Object.values(serverObject)) {
            list += `**${server.nick}:**\n`;
            for (const k of server.keywords) {
                list += `\t${k}`;
            }
            list += "\n";
        }

        message.channel.send(list).then((msg) => addTrash(msg, message));
    } else if (command === "ping") {
        message.react("🏓");
    } else if (command === "v" || command === "version") {
        message.channel.send(require("./package.json").version);
    } else if (command === "follow" || command === "f") {
    // Check rate limit for follow actions
        const rateLimitResult = checkRateLimit(message.author.id, "follow", CONFIG_VALUES.FOLLOW_RATE_LIMIT_PER_MINUTE);
        if (!rateLimitResult.allowed) {
            return message.channel.send(`Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before following another map.`);
        }

        const map = args.join(" ").toLowerCase();

        // Validate map name input
        const validation = validateMapName(map);
        if (!validation.valid) {
            return message.channel.send(validation.error);
        }

        // Check if the user is already following the map, and return a message if true
        if (await isFollowingMap(message.author.id, map)) {
            return message.channel.send("You are already following this map.");
        }

        // Follow the map
        await followMap(message.author.id, map);

        // Send a confirmation message and add a reaction for the user to undo the follow action
        try {
            const confirmMsg = await message.channel.send(`You are now following ${map}. You will be notified when the map comes on a server.`);
            // Add a reaction for the user to undo the follow action
            await confirmMsg.react("↩️");
            const filter = (reaction, user) => reaction.emoji.name === "↩️" && user.id === message.author.id;
            const collector = confirmMsg.createReactionCollector({
                filter,
                time: CONFIG_VALUES.MAP_FOLLOW_TIMEOUT_MS,
                max: 1
            });

            // Track collector state for proper cleanup
            let collectorStopped = false;

            collector.on("collect", async (r) => {
                try {
                    await unfollowMap(message.author.id, map);
                    await r.message.delete();
                    await message.delete().catch(() => {});
                    await message.channel.send(`You are no longer following ${map}.`);
                } catch {
                    // Message may already be deleted
                    console.debug("Message already deleted in follow confirmation collector");
                } finally {
                    if (!collectorStopped) {
                        collectorStopped = true;
                        collector.stop();
                    }
                }
            });

            collector.on("end", () => {
                // Collector ended naturally (timeout) or by limit
                // Ensure cleanup happens even if collector was already stopped
                if (!collectorStopped) {
                    collectorStopped = true;
                }
            });

            collector.on("error", (err) => {
                // Handle collector errors to prevent memory leaks
                console.error("Reaction collector error in follow confirmation:", err);
                if (!collectorStopped) {
                    collectorStopped = true;
                    collector.stop();
                }
            });

            // Ensure collector is cleaned up if message is deleted externally
            confirmMsg.delete().catch(() => {}).finally(() => {
                if (!collectorStopped) {
                    collectorStopped = true;
                    collector.stop();
                }
            });
        } catch (e) {
            console.error("Failed to set up follow confirmation:", e);
        }

        console.log(`${message.author.tag} followed map ${map}`);

        // Log the map follow action in the log channel
        const logEmbed = new EmbedBuilder()
            .setTitle("User Followed Map")
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setTimestamp(Date.now())
            .addFields({ name: "User", value: message.author.toString() }, { name: "Map", value: map })
            .setThumbnail(message.author.displayAvatarURL())
            .setAuthor({
                name: message.author.tag,
                iconURL: message.author.displayAvatarURL()
            });

        if (logChannel) {
            logChannel.send({ embeds: [logEmbed] });
        }
    } else if (command === "unfollow" || command === "uf") {
    // Check rate limit for unfollow actions
        const rateLimitResult = checkRateLimit(message.author.id, "unfollow", CONFIG_VALUES.UNFOLLOW_RATE_LIMIT_PER_MINUTE);
        if (!rateLimitResult.allowed) {
            return message.channel.send(`Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before unfollowing another map.`);
        }

        const map = args.join(" ").toLowerCase();

        // Validate map name input
        const validation = validateMapName(map);
        if (!validation.valid) {
            return message.channel.send(validation.error);
        }

        // If the argument is "all", unfollow all maps
        if (map === "all") {
            await unfollowAll(message.author.id);
            message.channel.send("You are no longer following any maps.");
            console.log(`${message.author.tag} unfollowed all maps`);
        } else {
            // If the user is not following the map, return an error message
            if (!(await isFollowingMap(message.author.id, map))) {
                return message.channel.send(`You are not following this map. Use \`/listfollows\` or \`${config.discord.prefix}listfollows\` to see a list of maps you are following.`);
            }

            // Unfollow the map
            await unfollowMap(message.author.id, map);
            message.channel.send(`You are no longer following ${map}.`);
            console.log(`${message.author.tag} unfollowed map ${map}`);
        }

        // Log the map unfollow action in the log channel
        const logEmbed = new EmbedBuilder()
            .setTitle("User Unfollowed Map")
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setTimestamp(Date.now())
            .addFields({ name: "User", value: message.author.toString() }, { name: "Map", value: map })
            .setThumbnail(message.author.displayAvatarURL())
            .setAuthor({
                name: message.author.tag,
                iconURL: message.author.displayAvatarURL()
            });

        if (logChannel) {
            logChannel.send({ embeds: [logEmbed] });
        }
    } else if (command === "listfollows" || command === "lf") {
    // List all user follows
        const follows = await getUserFollows(message.author.id);
        // console.log(follows)
        if (follows.length === 0) return message.channel.send("You are not following any maps.");
        let list = "";
        for (const follow of follows) {
            const stats = getStatsPage(follow.map_name);
            if (stats) {
                list += `[${follow.map_name}](${stats})\n`;
            } else {
                list += `${follow.map_name}\n`;
            }
        }
        const embed = new EmbedBuilder()
            .setTitle("List of maps you are following:")
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setTimestamp(Date.now())
            .setDescription(list);
        message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
    }
}

async function handleDevCommand(message, args, command) {
    if (command === "id") {
        message.channel.send("Loading message ID...").then((m) => {
            m.edit(m.id);
        });
    } else if (command === "mem") {
        const used = process.memoryUsage();
        let out = "```";
        for (const key in used) {
            out += `${key} ${Math.round((used[key] / 1024 / 1024) * 100) / 100} MB\n`;
        }
        out += "```";

        message.channel.send(out);
    } else if (command === "check") {
    // Check rate limit for IP check actions
        const rateLimitResult = checkRateLimit(message.author.id, "ipCheck", CONFIG_VALUES.IP_CHECK_RATE_LIMIT_PER_MINUTE);
        if (!rateLimitResult.allowed) {
            return message.channel.send(`Rate limit exceeded. Please wait ${rateLimitResult.retryAfter} seconds before checking another IP.`);
        }

        const ip = args[0];

        if (!ip) return message.channel.send("Please enter an ip.");

        // Validate IP address to prevent command injection and internal network scanning
        const ipValidation = validateIP(ip);
        if (!ipValidation.valid) {
            return message.channel.send(`Invalid IP address: ${ipValidation.error}`);
        }

        if (ipValidation.isPrivate) {
            return message.channel.send("Private IP addresses are not allowed for security reasons.");
        }

        const embed = await checkIP(ip);

        if (!embed) return message.channel.send("The server is unavailable.");

        message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
    } else if (command === "listallfollows" || command === "laf") {
    // Retrieve all followed maps from the database
        const follows = await getAllFollows();

        // Sort follows by discord ID
        follows.sort((a, b) => {
            if (a.discord_id < b.discord_id) return -1;
            if (a.discord_id > b.discord_id) return 1;
            return 0;
        });

        // If there are no users following any maps, return an error message
        if (!follows || follows.length === 0) {
            return message.channel.send("There are no users following any maps.");
        }

        // Create a list of all followed maps
        let list = "";
        for (const follow of follows) {
            const stats = getStatsPage(follow.map_name);

            if (stats) {
                list += `<@${follow.discord_id}>: [${follow.map_name}](${stats})\n`;
            } else {
                list += `<@${follow.discord_id}>: ${follow.map_name}\n`;
            }
        }

        // Create an embed with the list of followed maps
        const embed = new EmbedBuilder()
            .setTitle("List of all followed maps:")
            .setColor(CONFIG_VALUES.EMBED_COLOR)
            .setTimestamp(Date.now())
            .setDescription(list);

        // Send the embed and add a trash reaction to it
        message.channel.send({ embeds: [embed] }).then((msg) => addTrash(msg, message));
    } else if (command === "testnotify") {
        let map = args.join(" ").toLowerCase();
        if (!map) return message.channel.send("Please enter a valid map name.");
        // If the map isn't in the database
        if (!(await hasMap(map))) return message.channel.send("No one is following this map.");
        // React a thumbs up to the message

        await notifyUsers(map);
    } else if (command === "removeuser") {
        const userID = args[0];
        if (!userID) return message.channel.send("Please enter a valid user ID.");
        await unfollowAll(userID);
        message.channel.send(`Removed all maps from user <@${userID}>.`);
    }
}

async function checkIP(ip) {
    // Extract port from the IP address, if available
    let port = config.serverUpdate?.defaultPort || "27015";
    if (ip.includes(":")) {
        [ip, port] = ip.split(":");
    }

    // Create a server object with the necessary information for getInfo()
    const server = {
        ip: `${ip}:${port}`,
        nick: "Custom Server",
        show: true,
        keywords: []
    };

    // Get server info using getInfo()
    const serverInfo = await getInfo(server);

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

const notifyUsers = async (map, serverObj) => {
    const server = serverObj?.nick ?? "unknown server";
    const ip = serverObj?.ip ?? "unknown IP";
    const users = await getUsersFollowingMap(map);

    // Track notification rate to prevent spam
    const notificationRateLimit = new Map();
    const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
    const MAX_NOTIFICATIONS_PER_USER = 1; // Max 1 notification per user per minute

    for (const user of users) {
        const stats = getStatsPage(map);
        const mapImage = getMapImage(map);

        // Fetch user first to ensure we have a valid reference
        let u;
        try {
            u = await getCachedUser(user.discord_id);
        } catch (fetchError) {
            console.warn(`Failed to fetch user ${user.discord_id}:`, fetchError.message);
            u = null;
        }

        try {
            if (!u) {
                // User fetch failed, send fallback notification to log channel
                const backupEmbed = new EmbedBuilder()
                    .setTitle(`${map} is now on ${server}`)
                    .setDescription(
                        `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
                    )
                    .setColor(CONFIG_VALUES.EMBED_COLOR)
                    .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
                    .setTimestamp(Date.now());

                if (stats) backupEmbed.setURL(stats);
                if (mapImage) backupEmbed.setImage(mapImage);

                const fallbackContent = `${map} is now on ${server}!\nsteam://connect/${ip}`;

                try {
                    await withRetry(async () => {
                        const guild = bot.guilds.cache.get(config.fallback.guildID);
                        if (!guild) {
                            throw new Error(`Fallback guild ${config.fallback.guildID} not found`);
                        }
                        const channel = guild.channels.cache.get(config.fallback.channelID);
                        if (!channel) {
                            throw new Error(`Fallback channel ${config.fallback.channelID} not found`);
                        }
                        channel.send({
                            embeds: [backupEmbed],
                            content: fallbackContent
                        });
                    });
                } catch (fallbackError) {
                    console.error(`Failed to send fallback notification for ${map}:`, fallbackError);
                }
                continue;
            }

            // Rate limiting: Check if user has received too many notifications recently
            const now = Date.now();
            if (!notificationRateLimit.has(user.discord_id)) {
                notificationRateLimit.set(user.discord_id, []);
            }
            const userNotifications = notificationRateLimit.get(user.discord_id);
      
            // Filter out notifications older than the rate limit window
            const recentNotifications = userNotifications.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW_MS);
      
            if (recentNotifications.length >= MAX_NOTIFICATIONS_PER_USER) {
                // Skip notification to prevent spam
                continue;
            }
      
            // Record this notification
            recentNotifications.push(now);
            notificationRateLimit.set(user.discord_id, recentNotifications);

            // Prepare the embed for the direct message
            const dmEmbed = new EmbedBuilder()
                .setTitle(`${map} is now on ${server}`)
                .setDescription(
                    `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
                )
                .setColor(CONFIG_VALUES.EMBED_COLOR)
                .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
                .setTimestamp(Date.now());

            if (stats) dmEmbed.setURL(stats);

            if (mapImage) dmEmbed.setImage(mapImage);

            // Send the direct message to the user with proper error handling
            await u.send({
                embeds: [dmEmbed],
                content: `${map} is now on ${server}!\nsteam://connect/${ip}`
            });

            // Log the successful notification (without exposing user's full identity)
            const logEmbed = new EmbedBuilder()
                .setTitle("Notification sent")
                .setColor(CONFIG_VALUES.EMBED_COLOR)
                .setTimestamp(Date.now())
                .setDescription(`Notification sent to user <@${user.discord_id}> for map ${map}`)
                .setAuthor({ name: u.tag, iconURL: u.displayAvatarURL() })
                .setThumbnail(u.displayAvatarURL());

            if (logChannel) {
                logChannel.send({ embeds: [logEmbed] });
            }
            console.log(`Sent notification to ${u.tag} about ${map}`);
        } catch (e) {
            // Handle failed DM (user may have DMs disabled or other issues)
            // Only log the error without exposing sensitive user information
            const userId = u?.id || user.discord_id;
            console.warn(`Failed to send DM to user <@${userId}> about ${map}:`, e.message);

            // Send fallback notification to log channel (without user mention)
            const backupEmbed = new EmbedBuilder()
                .setTitle(`${map} is now on ${server}`)
                .setDescription(
                    `**__Players:__** ${serverObj?.numPlayers ?? "unknown"} (${serverObj?.numBots ?? "unknown"}) / ${serverObj?.maxPlayers ?? "unknown"}`
                )
                .setColor(CONFIG_VALUES.EMBED_COLOR)
                .setFooter({ text: "Last Updated", iconURL: CONFIG_VALUES.FALLBACK_AVATAR })
                .setTimestamp(Date.now());

            if (stats) backupEmbed.setURL(stats);
            if (mapImage) backupEmbed.setImage(mapImage);

            const fallbackContent = `${map} is now on ${server}!\nsteam://connect/${ip}`;

            try {
                await withRetry(async () => {
                    bot.guilds.cache
                        .get(config.fallback.guildID)
                        .channels.cache.get(config.fallback.channelID)
                        .send({
                            embeds: [backupEmbed],
                            content: fallbackContent
                        });
                });
            } catch (fallbackError) {
                console.error(`Failed to send fallback notification for ${map}:`, fallbackError);
            }
        }
    }
};

// Initialize oldData with server keys from serverObject and set values to 0
const oldData = {};
const serverObjectKeys = Object.keys(serverObject);

for (const server of serverObjectKeys) {
    oldData[server] = 0;
}

// Function to update server data and notify users if there's a change in the .map property
const updateServerData = async () => {
    for (const currentServer of serverObjectKeys) {
        let currentServerObject = serverObject[currentServer];

        if (!(currentServer in oldData)) {
            oldData[currentServer] = "";
            continue;
        }

        if (!gData[currentServer] || !gData[currentServer].online) {
            continue;
        }

        const currentMap = gData[currentServer].map;

        if (oldData[currentServer] !== "" && oldData[currentServer] !== currentMap) {
            const newMap = currentMap;

            currentServerObject["numPlayers"] = gData[currentServer].numPlayers;
            currentServerObject["numBots"] = gData[currentServer].numBots;
            currentServerObject["maxPlayers"] = gData[currentServer].maxPlayers;

            await notifyUsers(newMap, currentServerObject);
            oldData[currentServer] = newMap;
        } else if (oldData[currentServer] === "") {
            oldData[currentServer] = currentMap;
        }
    }
};

// Run the updateServerData function every 91 seconds (91000 milliseconds)
setInterval(updateServerData, CONFIG_VALUES.MAP_CHECK_INTERVAL_MS);

//if a member leaves delete all their follows in db
bot.on("guildMemberRemove", async (member) => {
    await unfollowAll(member.id);
});

// Graceful shutdown handling
process.on("SIGINT", async () => {
    console.log("Received SIGINT, shutting down...");
    try {
    // Close database connection
        closeDB();
        process.exit(0);
    } catch (error) {
        console.error("Shutdown error:", error);
        process.exit(1);
    }
});

process.on("SIGTERM", async () => {
    console.log("Received SIGTERM, shutting down...");
    try {
    // Close database connection
        closeDB();
        process.exit(0);
    } catch (error) {
        console.error("Shutdown error:", error);
        process.exit(1);
    }
});
