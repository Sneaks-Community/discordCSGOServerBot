/**
 * Server data management service
 * Handles server state, queries, and updates
 */

import { GameDig } from "gamedig";
import pLimit from "p-limit";

import serverObject from "../../servers.json" with { type: "json" };
import { CONFIG_VALUES } from "../config/index.js";
import { playerNameSchema } from "../schemas/validationSchemas.js";
import { serviceLogger } from "../utils/logger.js";
import { normalizeMapName } from "../utils/mapUtils.js";
import { validateWithZod } from "../utils/zodValidator.js";

// Server data state management
let _serverData = {};
let _isRefreshing = false;

// Track old data for map change notifications
const oldData = {};
const serverObjectKeys = Object.keys(serverObject);

// Initialize oldData with server keys
for (const server of serverObjectKeys) {
    oldData[server] = "";
}

/**
 * Get current server data (immutable copy)
 * @returns {Object} - Copy of server data
 */
export function getServerData() {
    return { ..._serverData };
}

/**
 * Check if server data is empty (bot still starting)
 * @returns {boolean}
 */
export function isServerDataEmpty() {
    return Object.keys(_serverData).length === 0;
}

/**
 * Update server data atomically
 * @param {Object} newData - New server data from refresh
 */
export function setServerData(newData) {
    _serverData = { ...newData };
}

/**
 * Get a specific server by keyword or index
 * @param {string} keyword - Server keyword or index
 * @returns {Object|null} - Server object or null
 */
export function getServerByKeyword(keyword) {
    for (const server of Object.values(_serverData)) {
        if (server.keywords.includes(keyword) || String(server.index) === keyword) {
            return server;
        }
    }
    return null;
}

/**
 * Query server information using GameDig
 * @param {Object} server - Server configuration object
 * @param {number} index - Server index
 * @returns {Promise<Object>} - Server data object
 */
export async function getInfo(server, index) {
    // Get IP and port from the server object
    const [ip, port] = server.ip.split(":");

    let valid = true;

    // Query the server using Gamedig
    const res = await GameDig.query({
        host: ip,
        maxRetries: CONFIG_VALUES.GAMEDIG_MAX_RETRIES,
        port: port,
        type: server.protocol || "csgo"
    }).catch((err) => {
        serviceLogger.error({ err, serverIp: server.ip }, "GameDig query failed");
        valid = false;
    });

    let data;

    if (valid) {
        // Sanitize player names from game server using Zod v4 schema
        // This prevents Discord markdown injection and ensures data integrity
        const sanitizedPlayers = res.players
            .map((player) => {
                const result = validateWithZod(playerNameSchema, player.name, "Player name");
                if (!result.valid) {
                    serviceLogger.warn(`Invalid player name detected, using 'Unknown': ${result.error}`);
                    return { ...player, name: "Unknown" };
                }
                return { ...player, name: result.data };
            })
            .filter((player) => player.name && player.name !== "Unknown");

        // Sanitize bot names similarly
        const sanitizedBots = res.bots
            .map((bot) => {
                const result = validateWithZod(playerNameSchema, bot.name, "Bot name");
                if (!result.valid) {
                    return { ...bot, name: "Unknown Bot" };
                }
                return { ...bot, name: result.data };
            })
            .filter((bot) => bot.name && bot.name !== "Unknown Bot");

        // If the server is valid, populate the data object with server information
        data = {
            bots: sanitizedBots, // Bots array {name, score, time}
            fullIP: res.connect, // String with ip:port
            index: index,
            keywords: server.keywords, // array of keywords for --players command
            map: normalizeMapName(res.map), // Current map, workshop path stripped to the bare name
            maxPlayers: res.maxplayers,
            name: server.nick, // Short nickname
            numBots: sanitizedBots.length, // int (gamedig v5.x API)
            numPlayers: sanitizedPlayers.length, // int (gamedig v5.x API)
            online: true,
            players: sanitizedPlayers, // Players array {name, score, time}
            show: server.show // bool to print server in embed
        };
    } else {
        // If the server is not valid, populate the data object with minimal information
        data = {
            index: index,
            keywords: server.keywords,
            name: server.nick,
            online: false
        };
    }

    return data;
}

/**
 * Refresh all server data with connection limits
 * @returns {Promise<void>}
 */
export async function refresh() {
    if (_isRefreshing) {
        serviceLogger.debug("Skipping refresh -- already in progress");
        return;
    }

    _isRefreshing = true;
    try {
        const serverEntries = Object.entries(serverObject);
    
        // Create a limiter for concurrent server queries
        const limit = pLimit(CONFIG_VALUES.MAX_CONCURRENT_SERVER_QUERIES);
    
        const results = await Promise.all(
            serverEntries.map(([name, server], index) =>
                limit(async () => {
                    try {
                        const data = await getInfo(server, index + 1);
                        return [name, data];
                    } catch (err) {
                        serviceLogger.error({ err, server: name }, "Failed to query server");
                        // Return minimal data on error
                        return [name, { index: index + 1, keywords: server.keywords, name: server.nick, online: false }];
                    }
                })
            )
        );
    
        setServerData(Object.fromEntries(results));
    } finally {
        _isRefreshing = false;
    }
}

/**
 * Update server data and check for map changes
 * @param {Function} notifyCallback - Callback function for map change notifications
 * @returns {Promise<void>}
 */
export async function updateServerData(notifyCallback) {
    const serverData = getServerData();
    
    for (const currentServer of serverObjectKeys) {
        const currentServerObject = serverObject[currentServer];

        if (!serverData[currentServer] || !serverData[currentServer].online) {
            continue;
        }

        const currentMap = serverData[currentServer].map;

        if (oldData[currentServer] !== "" && oldData[currentServer] !== currentMap) {
            const newMap = currentMap;

            currentServerObject["numPlayers"] = serverData[currentServer].numPlayers;
            currentServerObject["numBots"] = serverData[currentServer].numBots;
            currentServerObject["maxPlayers"] = serverData[currentServer].maxPlayers;

            // Record the change before notifying: if the notification fails, this
            // server must not re-detect the same map change on every subsequent tick.
            oldData[currentServer] = newMap;

            if (notifyCallback) {
                try {
                    await notifyCallback(newMap, currentServerObject);
                } catch (err) {
                    // Contained per server so the remaining servers still get notified.
                    serviceLogger.error({ err, map: newMap, server: currentServer }, "Map change notification failed");
                }
            }
        } else if (oldData[currentServer] === "") {
            oldData[currentServer] = currentMap;
        }
    }
}
