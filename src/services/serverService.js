/**
 * Server data management service
 * Handles server state, queries, and updates
 */

import { GameDig } from "gamedig";
import pLimit from "p-limit";

import { CONFIG_VALUES, serverObject } from "../config/index.js";
import { DEFAULT_SERVER_PORT, playerNameSchema } from "../schemas/validationSchemas.js";
import { serviceLogger } from "../utils/logger.js";
import { normalizeMapName } from "../utils/mapUtils.js";
import { validateWithZod } from "../utils/zodValidator.js";

// Server data state management
let _serverData = {};
let _isRefreshing = false;
let _isNotifying = false;

/**
 * Bounds one gamedig attempt rather than inheriting its 10s default. maxRetries is a
 * multiplier over the ports gamedig tries, not a total attempt budget, so that default
 * lets a single unreachable server occupy the better part of an update interval.
 */
const QUERY_ATTEMPT_TIMEOUT_MS = 3000;

/** How long one unanswered packet waits. Matches gamedig's own default. */
const QUERY_SOCKET_TIMEOUT_MS = 2000;

/**
 * Share of SERVER_UPDATE_INTERVAL a whole refresh pass may spend querying. Under 1 on
 * purpose: a pass that runs into the next tick is dropped by the _isRefreshing guard,
 * and the embed then republishes the previous snapshot under a description promising it
 * is current, with map-change detection a full interval late.
 */
const REFRESH_BUDGET_FRACTION = 0.8;

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
function setServerData(newData) {
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
 * Sanitize one player or bot entry, replacing an unusable name rather than
 * dropping the row, which used to hide players and understate the count.
 * @param {Object} entry - gamedig player or bot entry
 * @param {string} fallback - Name to use when the real one is unusable
 * @param {string} label - Field label for the validation message
 * @returns {Object} - Entry with a usable name
 */
function sanitizeEntry(entry, fallback, label) {
    const result = validateWithZod(playerNameSchema, entry.name, label);

    if (!result.valid) {
        serviceLogger.debug({ reason: result.error }, `Unusable ${label.toLowerCase()}, substituting "${fallback}"`);
        return { ...entry, name: fallback };
    }

    return { ...entry, name: result.data };
}

/**
 * Read the counts the server reports for itself; `res.numplayers` includes bots
 * and `res.players` can be truncated, so take the larger of reported and listed.
 * @param {Object} res - gamedig query result
 * @returns {{numBots: number, numPlayers: number}} - Reported counts
 */
function readCounts(res) {
    const reportedBots = Number(res.raw?.numbots);
    const numBots = Math.max(Number.isInteger(reportedBots) ? reportedBots : 0, res.bots.length);

    const reportedTotal = Number(res.numplayers);
    const reportedHumans = Number.isInteger(reportedTotal) ? reportedTotal - numBots : 0;

    return { numBots, numPlayers: Math.max(reportedHumans, res.players.length, 0) };
}

/**
 * The data a server that could not be queried is represented by: enough for the
 * embed and /players to name it, and nothing that would read as live state.
 * Shared by getInfo's failed query and refresh's catch, which must produce the
 * same shape or a caller would see fields on one path and not the other.
 * @param {Object} server - Server configuration object
 * @param {number} index - Server index
 * @returns {Object} - Minimal offline server data
 */
function buildOfflineServerData(server, index) {
    return {
        index,
        keywords: server.keywords,
        name: server.nick,
        online: false
    };
}

/**
 * Query server information using GameDig
 * @param {Object} server - Server configuration object
 * @param {number} index - Server index
 * @returns {Promise<Object>} - Server data object
 */
export async function getInfo(server, index) {
    // Split the host from the port. validateServersConfig has already rejected
    // anything that is not "host" or "host:port" with a numeric in-range port,
    // so the port only needs its default applied and a cast to a number.
    const [host, rawPort] = server.ip.split(":");
    const port = rawPort === undefined ? DEFAULT_SERVER_PORT : Number(rawPort);

    let valid = true;

    // Query the server using Gamedig
    const res = await GameDig.query({
        attemptTimeout: QUERY_ATTEMPT_TIMEOUT_MS,
        host: host,
        maxRetries: CONFIG_VALUES.GAMEDIG_MAX_RETRIES,
        port: port,
        socketTimeout: QUERY_SOCKET_TIMEOUT_MS,
        type: server.protocol || "csgo"
    }).catch((err) => {
        serviceLogger.error({ err, serverIp: server.ip }, "GameDig query failed");
        valid = false;
    });

    let data;

    if (valid) {
        // Names are escaped at render time, so this only ensures a usable string
        const sanitizedPlayers = res.players.map((player) => sanitizeEntry(player, "Unknown", "Player name"));
        const sanitizedBots = res.bots.map((bot) => sanitizeEntry(bot, "Unknown Bot", "Bot name"));

        const { numBots, numPlayers } = readCounts(res);

        // If the server is valid, populate the data object with server information
        data = {
            bots: sanitizedBots, // Bots array {name, score, time}
            fullIP: res.connect, // String with ip:port
            index: index,
            keywords: server.keywords, // array of keywords for --players command
            map: normalizeMapName(res.map), // Current map, workshop path stripped to the bare name
            maxPlayers: res.maxplayers,
            name: server.nick, // Short nickname
            numBots: numBots,
            numPlayers: numPlayers, // Humans only; the bot count is reported separately
            online: true,
            players: sanitizedPlayers // Players array {name, score, time}
        };
    } else {
        // If the server is not valid, populate the data object with minimal information
        data = buildOfflineServerData(server, index);
    }

    return data;
}

/**
 * Query one server, giving up on it once the pass has no time left to spend.
 *
 * Both giving-up paths return the same shape a failed query does, because they mean
 * the same thing to a caller: there is no live data for this server this tick. The
 * gamedig timeouts bound one attempt each, and MAX_CONCURRENT_QUERIES turns the
 * server list into batches, so neither one bounds the pass -- this does.
 * @param {string} name - Server key in serverObject, for logging
 * @param {Object} server - Server configuration object
 * @param {number} index - Server index
 * @param {number} deadline - Epoch ms the whole pass must be finished by
 * @returns {Promise<Object>} - Server data, or the offline shape if time ran out
 */
async function getInfoWithinDeadline(name, server, index, deadline) {
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
        serviceLogger.warn({ server: name }, "Refresh ran out of time before this server was queried; reporting it offline");
        return buildOfflineServerData(server, index);
    }

    let timer;
    const ranOut = new Promise((resolve) => {
        timer = setTimeout(() => {
            serviceLogger.warn({ remainingMs, server: name }, "Server query outlasted the refresh budget; reporting it offline");
            resolve(buildOfflineServerData(server, index));
        }, remainingMs);
    });

    try {
        // gamedig offers no cancellation, so a late answer is discarded rather than
        // waited for. The socket work it leaves behind ends on its own timeouts.
        return await Promise.race([getInfo(server, index), ranOut]);
    } finally {
        clearTimeout(timer);
    }
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
    const startedAt = Date.now();

    try {
        const serverEntries = Object.entries(serverObject);
        const deadline = startedAt + Math.round(CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS * REFRESH_BUDGET_FRACTION);

        // Create a limiter for concurrent server queries
        const limit = pLimit(CONFIG_VALUES.MAX_CONCURRENT_SERVER_QUERIES);

        const results = await Promise.all(
            serverEntries.map(([name, server], index) =>
                limit(async () => {
                    try {
                        const data = await getInfoWithinDeadline(name, server, index + 1, deadline);
                        return [name, data];
                    } catch (err) {
                        serviceLogger.error({ err, server: name }, "Failed to query server");
                        // Return minimal data on error
                        return [name, buildOfflineServerData(server, index + 1)];
                    }
                })
            )
        );

        setServerData(Object.fromEntries(results));
    } finally {
        _isRefreshing = false;

        // Measured against the interval rather than the budget: hitting the budget is
        // the deadline working, and is already logged per server. Passing the interval
        // means the deadline did not hold, which costs the next tick entirely and is
        // otherwise only visible as embeds that quietly stop matching the interval they
        // advertise.
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs > CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS) {
            serviceLogger.warn({ elapsedMs, intervalMs: CONFIG_VALUES.EMBED_UPDATE_INTERVAL_MS }, "Refresh pass outlasted the update interval; the next tick will be skipped");
        } else {
            serviceLogger.debug({ elapsedMs }, "Refresh pass complete");
        }
    }
}

/**
 * Update server data and check for map changes
 * @param {Function} notifyCallback - Callback function for map change notifications
 * @returns {Promise<void>}
 */
export async function updateServerData(notifyCallback) {
    // Belt and braces: the caller already awaits this once per tick, but DM fanout
    // can outlast a tick and a second pass would re-read the same snapshot.
    if (_isNotifying) {
        serviceLogger.debug("Skipping map change check -- notifications still in progress");
        return;
    }

    _isNotifying = true;
    try {
        const serverData = getServerData();

        for (const currentServer of serverObjectKeys) {
            const currentServerObject = serverObject[currentServer];

            if (!serverData[currentServer] || !serverData[currentServer].online) {
                continue;
            }

            const currentMap = serverData[currentServer].map;

            if (oldData[currentServer] !== "" && oldData[currentServer] !== currentMap) {
                const newMap = currentMap;
                const live = serverData[currentServer];

                // Record the change before notifying: if the notification fails, this
                // server must not re-detect the same map change on every subsequent tick.
                oldData[currentServer] = newMap;

                if (notifyCallback) {
                    try {
                        // A fresh object each time. Writing the live counts onto
                        // serverObject[currentServer] polluted the loaded servers.json,
                        // which /keywords and validateServersConfig read as config.
                        await notifyCallback(newMap, {
                            ...currentServerObject,
                            fullIP: live.fullIP,
                            maxPlayers: live.maxPlayers,
                            numBots: live.numBots,
                            numPlayers: live.numPlayers
                        });
                    } catch (err) {
                        // Contained per server so the remaining servers still get notified.
                        serviceLogger.error({ err, map: newMap, server: currentServer }, "Map change notification failed");
                    }
                }
            } else if (oldData[currentServer] === "") {
                oldData[currentServer] = currentMap;
            }
        }
    } finally {
        _isNotifying = false;
    }
}
