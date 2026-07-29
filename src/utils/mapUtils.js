/**
 * Map utilities for CS:GO maps
 * Builds map image URLs from a single configurable base URL
 */

import { config } from "../config/index.js";

/**
 * Build the map image URL for any map, or false if no base URL is configured
 * @param {string} mapName - The map name
 * @returns {string|false} - The image URL or false if no base URL is set
 */
export function getMapImage(mapName) {
    const base = config.mapImageBaseUrl;
    return base ? `${base}${mapName}.jpg` : false;
}

/**
 * Normalize a map name as reported by a game server.
 * Workshop maps arrive as a path ("workshop/123456/surf_xyz"), but only the final
 * segment is the map itself; the numeric workshop id is noise that also breaks map
 * image URLs and the follow schema.
 * @param {string} mapName - The raw map name from the game server
 * @returns {string} - The bare map name, unchanged if there is nothing to strip
 */
export function normalizeMapName(mapName) {
    if (typeof mapName !== "string") return mapName;

    const trimmed = mapName.trim();
    const lastSegment = trimmed.split(/[/\\]/).findLast(Boolean);
    return lastSegment ?? trimmed;
}
