/**
 * The player-count format is the one string four call sites share, so a change
 * here silently rewrites the server list, /players, the server picker and the
 * map-change DM at once.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";

const { createBaseEmbed, formatPlayerCounts } = await import("../src/embeds/baseEmbed.js");

describe("formatPlayerCounts", () => {
    it("puts bots in parentheses, between humans and the cap", () => {
        assert.equal(formatPlayerCounts({ maxPlayers: 24, numBots: 2, numPlayers: 12 }), "12 (2) / 24");
    });

    // 0 is a count, not a missing value: a `||` fallback here would report an
    // empty server as "unknown".
    it("renders a zero count as zero", () => {
        assert.equal(formatPlayerCounts({ maxPlayers: 0, numBots: 0, numPlayers: 0 }), "0 (0) / 0");
    });

    // The shape /testnotify passes: a nick and an ip, no counts.
    it("falls back per field for a server carrying no counts", () => {
        assert.equal(formatPlayerCounts({ ip: "0.0.0.0:27015", nick: "Test Server" }), "unknown (unknown) / unknown");
    });

    it("falls back for a partial snapshot rather than printing undefined", () => {
        assert.equal(formatPlayerCounts({ numPlayers: 5 }), "5 (unknown) / unknown");
    });

    it("survives no server at all", () => {
        assert.equal(formatPlayerCounts(), "unknown (unknown) / unknown");
        assert.equal(formatPlayerCounts(null), "unknown (unknown) / unknown");
    });
});

describe("createBaseEmbed", () => {
    it("clamps a title past Discord's 256 characters", () => {
        const { title } = createBaseEmbed("t".repeat(5000)).toJSON();

        assert.equal(title.length, 256);
        assert.ok(title.endsWith("\u2026"));
    });

    // playerListEmbed builds its title from a server name and a map, both of
    // which arrive from the game server.
    it("leaves a normal title untouched", () => {
        assert.equal(createBaseEmbed("12 (2) / 24 players connected to Surf on de_dust2").toJSON().title,
            "12 (2) / 24 players connected to Surf on de_dust2");
    });
});
