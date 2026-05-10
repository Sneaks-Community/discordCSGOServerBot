/**
 * Server data management service
 * Handles server state, queries, and updates
 */

import { GameDig } from "gamedig";
import pLimit from "p-limit";

import serverObject from "../../servers.json" with { type: "json" };
import { CONFIG_VALUES } from "../config/index.js";
import { serviceLogger } from "../utils/logger.js";

// Server data state management
let _serverData = {};
const _isRefreshing = false;
let _lastRefreshTime = 0;

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
    _lastRefreshTime = Date.now();
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
        serviceLogger.error(`GameDig query failed for ${server.ip}:`, err.message);
        valid = false;
    });

    let data;

    if (valid) {
        // If the server is valid, populate the data object with server information
        data = {
            bots: res.bots, // Bots array {name, score, time}
            fullIP: res.connect, // String with ip:port
            index: index,
            keywords: server.keywords, // array of keywords for --players command
            map: res.map, // Current map
            maxPlayers: res.maxplayers,
            name: server.nick, // Short nickname
            numBots: res.bots.length, // int (gamedig v5.x API)
            numPlayers: res.players.length, // int (gamedig v5.x API)
            online: true,
            players: res.players, // Players array {name, score, time}
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
                    serviceLogger.error(`Failed to query ${name}:`, err);
                    // Return minimal data on error
                    return [name, { index: index + 1, keywords: server.keywords, name: server.nick, online: false }];
                }
            })
        )
    );

    setServerData(Object.fromEntries(results));
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

        if (!(currentServer in oldData)) {
            oldData[currentServer] = "";
            continue;
        }

        if (!serverData[currentServer] || !serverData[currentServer].online) {
            continue;
        }

        const currentMap = serverData[currentServer].map;

        if (oldData[currentServer] !== "" && oldData[currentServer] !== currentMap) {
            const newMap = currentMap;

            currentServerObject["numPlayers"] = serverData[currentServer].numPlayers;
            currentServerObject["numBots"] = serverData[currentServer].numBots;
            currentServerObject["maxPlayers"] = serverData[currentServer].maxPlayers;

            if (notifyCallback) {
                await notifyCallback(newMap, currentServerObject);
            }
            oldData[currentServer] = newMap;
        } else if (oldData[currentServer] === "") {
            oldData[currentServer] = currentMap;
        }
    }
}
