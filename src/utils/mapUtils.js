import { config } from "../config/index.js";

/**
 * Encoded because on some paths the name arrives straight from a game server.
 * @param {string} mapName
 * @returns {string|false} - false when no base URL is configured
 */
export function getMapImage(mapName) {
    const base = config.mapImageBaseUrl;
    return base ? `${base}${encodeURIComponent(mapName)}.jpg` : false;
}

/**
 * Workshop maps arrive as a path ("workshop/123456/surf_xyz"); the id breaks
 * image URLs and the follow schema, so keep only the final segment.
 * @param {string} mapName
 * @returns {string}
 */
export function normalizeMapName(mapName) {
    if (typeof mapName !== "string") return mapName;

    const trimmed = mapName.trim();
    const lastSegment = trimmed.split(/[/\\]/).findLast(Boolean);
    return lastSegment ?? trimmed;
}
