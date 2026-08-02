/**
 * normalizeMapName is the boundary between a game server's raw A2S_INFO reply and
 * everything that renders or stores a map name, so it is the one place a workshop
 * path is turned back into a map.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// config reads the environment once, when it is imported, so this has to come first.
// The required variables are part of it: parseEnv answers with placeholder values
// when they are missing, so MAP_IMAGE_BASE_URL would be ignored without them.
process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";
process.env.MAP_IMAGE_BASE_URL = "https://images.test/maps/";

const { getMapImage, normalizeMapName } = await import("../src/utils/mapUtils.js");

describe("normalizeMapName", () => {
    it("keeps a plain map name as it is", () => {
        assert.equal(normalizeMapName("de_dust2"), "de_dust2");
    });

    it("strips the workshop id and path", () => {
        assert.equal(normalizeMapName("workshop/123456/surf_xyz"), "surf_xyz");
    });

    it("treats a backslash as a separator too", () => {
        assert.equal(normalizeMapName("maps\\de_dust2"), "de_dust2");
    });

    it("ignores a trailing separator rather than returning nothing", () => {
        assert.equal(normalizeMapName("workshop/123456/"), "123456");
    });

    it("trims surrounding whitespace", () => {
        assert.equal(normalizeMapName("  de_nuke  "), "de_nuke");
    });

    it("returns an empty string unchanged", () => {
        assert.equal(normalizeMapName(""), "");
    });

    it("passes a non-string through untouched", () => {
        for (const value of [undefined, null, 42]) {
            assert.equal(normalizeMapName(value), value);
        }
    });
});

describe("getMapImage", () => {
    it("builds the URL from the configured base", () => {
        assert.equal(getMapImage("de_dust2"), "https://images.test/maps/de_dust2.jpg");
    });

    it("encodes a name that came straight off a game server", () => {
        assert.equal(getMapImage("de dust/2"), "https://images.test/maps/de%20dust%2F2.jpg");
    });
});
