/**
 * MAP_IMAGE_BASE_URL is read once at import, so the disabled case needs its own
 * process. node --test gives every file one.
 */

import assert from "node:assert/strict";
import { it } from "node:test";

// Required variables included, or parseEnv falls back to placeholders and the
// empty MAP_IMAGE_BASE_URL below is never read.
process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";
process.env.MAP_IMAGE_BASE_URL = "";

const { getMapImage } = await import("../src/utils/mapUtils.js");

it("getMapImage reports no image when the base URL is empty", () => {
    assert.equal(getMapImage("de_dust2"), false);
});
