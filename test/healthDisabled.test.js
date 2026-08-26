/**
 * HEALTH_PORT is read once at import, so the disabled case needs its own
 * process. node --test gives every file one.
 */

import assert from "node:assert/strict";
import { it } from "node:test";

// 0 is the explicit opt-out and must open no socket.
process.env.HEALTH_PORT = "0";
process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";

const { startHealthServer, stopHealthServer } = await import("../src/services/healthService.js");

it("starts no listener when HEALTH_PORT is 0", () => {
    assert.equal(startHealthServer({ ws: { status: 0 } }), null);

    // Must be safe to call whether or not anything started.
    stopHealthServer();
});
