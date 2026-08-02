/**
 * HEALTH_PORT is read once at import, so the disabled default needs its own
 * process. node --test gives every file one.
 */

import assert from "node:assert/strict";
import { it } from "node:test";

// HEALTH_PORT deliberately unset: the default is 0, which must open no socket.
process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";

const { startHealthServer, stopHealthServer } = await import("../src/services/healthService.js");

it("starts no listener when HEALTH_PORT is unset", () => {
    assert.equal(startHealthServer({ ws: { status: 0 } }), null);

    // Must be safe to call whether or not anything started.
    stopHealthServer();
});
