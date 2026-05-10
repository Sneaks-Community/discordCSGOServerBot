/**
 * Map utilities for CS:GO maps
 * Handles map type detection, URL generation, and image fetching
 */

import { config } from "../config/index.js";

/**
 * Map type configuration for URL generation
 * Uses optional config URLs with fallbacks
 */
export const MAP_CONFIG = {
    bhop: {
        displayFormat: (map) => `[${map}](https://snksrv.com/bhopstats/index.php?map=${map})`,
        imageUrl: (map) => config.mapUrls?.bhop?.image || `https://bans.snksrv.com/images/maps/${map}.jpg`,
        prefixes: ["bhop"],
        statsUrl: (map) => config.mapUrls?.bhop?.stats || `https://snksrv.com/bhopstats/index.php?map=${map}`
    },
    kz: {
        displayFormat: (map) => `[${map}](https://snksrv.com/kzstats/#/maps/${map}/)`,
        imageUrl: (map) => config.mapUrls?.kz?.image || `https://raw.githubusercontent.com/KZGlobalTeam/map-images/public/images/${map}.jpg`,
        prefixes: ["bkz_", "kz_", "kzpro_", "skz_", "vnl_", "xc_"],
        statsUrl: (map) => config.mapUrls?.kz?.stats || `https://snksrv.com/kzstats/#/maps/${map}/`
    },
    surf: {
        displayFormat: (map) => `[${map}](https://snksrv.com/surfstats/?view=map&name=${map})`,
        imageUrl: (map) => config.mapUrls?.surf?.image || `https://bans.snksrv.com/images/maps/${map}.jpg`,
        prefixes: ["surf_"],
        statsUrl: (map) => config.mapUrls?.surf?.stats || `https://snksrv.com/surfstats/?view=map&name=${map}`
    }
};

/**
 * Determine the map type based on prefix
 * @param {string} mapName - The map name to check
 * @returns {string|null} - The map type or null if not recognized
 */
export function getMapType(mapName) {
    for (const [type, mapConfig] of Object.entries(MAP_CONFIG)) {
        if (mapConfig.prefixes.some((prefix) => mapName.startsWith(prefix))) {
            return type;
        }
    }
    return null;
}

/**
 * Get the display format for a map name with link
 * @param {string} mapName - The map name
 * @returns {string} - The formatted map name with link
 */
export function getWebsite(mapName) {
    const mapType = getMapType(mapName);
    if (mapType && MAP_CONFIG[mapType].displayFormat) {
        return MAP_CONFIG[mapType].displayFormat(mapName);
    }
    // Return the map name if no matching prefix is found
    return mapName;
}

/**
 * Get the stats page URL for a map
 * @param {string} mapName - The map name
 * @returns {string|false} - The stats URL or false if not available
 */
export function getStatsPage(mapName) {
    const mapType = getMapType(mapName);
    if (mapType && MAP_CONFIG[mapType].statsUrl) {
        return MAP_CONFIG[mapType].statsUrl(mapName);
    }
    return false;
}

/**
 * Get the map image URL
 * @param {string} mapName - The map name
 * @returns {string|false} - The image URL or false if not available
 */
export function getMapImage(mapName) {
    const mapType = getMapType(mapName);
    if (mapType && MAP_CONFIG[mapType].imageUrl) {
        return MAP_CONFIG[mapType].imageUrl(mapName);
    }
    return false;
}