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
