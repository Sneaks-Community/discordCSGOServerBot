/**
 * Everything a game server reports (player names, map names) is rendered inside an
 * embed, so escaping is the boundary that keeps a name from restyling the list it
 * appears in or posing as a link.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { escapeForDiscord, escapeLines } from "../src/utils/discordEscape.js";

describe("escapeForDiscord", () => {
    it("escapes the inline markdown constructs", () => {
        assert.equal(escapeForDiscord("*bold*"), "\\*bold\\*");
        assert.equal(escapeForDiscord("_italic_"), "\\_italic\\_");
        assert.equal(escapeForDiscord("`code`"), "\\`code\\`");
        assert.equal(escapeForDiscord("~~struck~~"), "\\~\\~struck\\~\\~");
        assert.equal(escapeForDiscord("||spoiler||"), "\\|\\|spoiler\\|\\|");
    });

    it("escapes the backslash itself, so the escaping cannot be escaped", () => {
        assert.equal(escapeForDiscord("back\\slash"), "back\\\\slash");
    });

    it("defuses a masked link", () => {
        assert.equal(escapeForDiscord("[Free skins](https://evil.example)"), "\\[Free skins](https://evil.example)");
    });

    it("stops a name from restyling the list it sits in", () => {
        assert.equal(escapeForDiscord("# heading"), "\\# heading");
        assert.equal(escapeForDiscord("- bullet"), "\\- bullet");
        assert.equal(escapeForDiscord("1. numbered"), "1\\. numbered");
    });

    it("leaves ordinary parentheses alone", () => {
        assert.equal(escapeForDiscord("Bob (AFK)"), "Bob (AFK)");
    });

    it("coerces a non-string rather than throwing", () => {
        assert.deepEqual([undefined, null, 42].map((value) => escapeForDiscord(value)), ["", "", "42"]);
    });
});

describe("escapeLines", () => {
    it("drops non-strings and empty strings", () => {
        assert.deepEqual(escapeLines(["a", "", null, undefined, 5]), ["a"]);
    });

    it("keeps a player legitimately named \"null\"", () => {
        assert.deepEqual(escapeLines(["null", "undefined"]), ["null", "undefined"]);
    });

    it("escapes what it keeps", () => {
        assert.deepEqual(escapeLines(["*star*", "plain"]), ["\\*star\\*", "plain"]);
    });

    it("returns an empty list for an empty input", () => {
        assert.deepEqual(escapeLines([]), []);
    });
});
