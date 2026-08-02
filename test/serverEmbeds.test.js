/**
 * describeInterval writes the promise the embed makes to its readers ("updated
 * every 1.5 minutes"), so its rounding is user-visible text rather than a detail.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";

const { describeInterval } = await import("../src/embeds/serverEmbeds.js");

describe("describeInterval", () => {
    it("reads sub-minute intervals in seconds", () => {
        assert.equal(describeInterval(30_000), "30 seconds");
        assert.equal(describeInterval(45_000), "45 seconds");
    });

    it("singularizes one second and one minute", () => {
        assert.equal(describeInterval(1000), "1 second");
        assert.equal(describeInterval(60_000), "1 minute");
    });

    it("keeps one decimal so the default interval stays honest", () => {
        assert.equal(describeInterval(90_000), "1.5 minutes");
    });

    it("drops a trailing zero rather than writing \"2.0 minutes\"", () => {
        assert.equal(describeInterval(120_000), "2 minutes");
    });

    it("rounds to the nearest tenth of a minute", () => {
        assert.equal(describeInterval(100_000), "1.7 minutes");
    });
});
