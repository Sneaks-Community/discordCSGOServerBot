/**
 * The contract is "is the tick loop turning". The test that matters most is the
 * disconnected gateway staying healthy: discord.js recovers on its own, so
 * failing there would turn a Discord outage into a restart loop.
 */

import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";

import { Status } from "discord.js";

// Fixed: HEALTH_PORT is read once at import, and 0 means disabled rather than
// "pick a free one".
const PORT = 39371;

const INTERVAL_SECONDS = 30;

process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";
process.env.HEALTH_HOST = "127.0.0.1";
process.env.HEALTH_PORT = String(PORT);
process.env.SERVER_UPDATE_INTERVAL = String(INTERVAL_SECONDS);

const { recordTick, startHealthServer, stopHealthServer } = await import("../src/services/healthService.js");

/** Only the two fields the endpoint reads. */
const bot = { ws: { status: Status.Ready } };

/**
 * @param {string} [path]
 * @returns {Promise<{ body: object, status: number }>}
 */
async function get(path = "/health") {
    const response = await fetch(`http://127.0.0.1:${PORT}${path}`);

    return { body: await response.json(), status: response.status };
}

describe("health endpoint", () => {
    before(async () => {
        const server = startHealthServer(bot);
        assert.ok(server, "the server should start when HEALTH_PORT is set");
        await once(server, "listening");
    });

    after(() => {
        stopHealthServer();
    });

    it("reports stale before the first tick", async () => {
        const { body, status } = await get();

        assert.equal(status, 503);
        assert.equal(body.status, "stale");
        assert.equal(body.lastTickAt, null);
    });

    it("reports ok once a tick has been recorded", async () => {
        recordTick();

        const { body, status } = await get();

        assert.equal(status, 200);
        assert.equal(body.status, "ok");
        assert.ok(body.lastTickAgeMs >= 0);
        assert.equal(typeof body.lastTickAt, "string");
        assert.equal(typeof body.serversTotal, "number");
        assert.ok(body.uptimeSeconds >= 0);
    });

    it("stays healthy while Discord is disconnected", async () => {
        recordTick();
        bot.ws.status = Status.Disconnected;

        try {
            const { body, status } = await get();

            assert.equal(status, 200);
            assert.equal(body.status, "ok");
            // Reported, but not part of the verdict.
            assert.equal(body.discord.ready, false);
            assert.equal(body.discord.status, "Disconnected");
        } finally {
            bot.ws.status = Status.Ready;
        }
    });

    it("goes stale once the tick loop stops", async (t) => {
        t.mock.timers.enable({ apis: ["Date"], now: 1_700_000_000_000 });
        recordTick();
        t.mock.timers.tick(INTERVAL_SECONDS * 1000 * 4);

        const { body, status } = await get();

        assert.equal(status, 503);
        assert.equal(body.status, "stale");
    });

    it("404s anything but /health", async () => {
        const { status } = await get("/metrics");

        assert.equal(status, 404);
    });
});
