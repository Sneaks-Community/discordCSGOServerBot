/**
 * Server data management service
 * Handles server state, queries, and updates
 */

import { GameDig } from "gamedig";
import pLimit from "p-limit";

import { CONFIG_VALUES } from "../config/index.js";
import serverObject from "../../servers.json" with { type: "json" };

// Server data state management
let _serverData = {};
let _isRefreshing = false;
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
                } catch (error) {
                    console.error(`Failed to query ${name}:`, error);
                    // Return minimal data on error
                    return [name, { online: false, name: server.nick, keywords: server.keywords, index: index + 1 }];
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
        let currentServerObject = serverObject[currentServer];

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