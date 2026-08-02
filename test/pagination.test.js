/**
 * paginateLines is the half of the pagination code that can be tested without a
 * Discord client, and it carries the invariants that matter: no page over the
 * embed description limit, and no line silently lost on the way.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { paginateLines } from "../src/utils/pagination.js";
import { EMBED_DESCRIPTION_LIMIT } from "../src/utils/truncate.js";

describe("paginateLines", () => {
    it("returns no pages for an empty listing", () => {
        assert.deepEqual(paginateLines([]), []);
    });

    it("keeps a short listing on one page", () => {
        assert.deepEqual(paginateLines(["a", "b", "c"]), ["a\nb\nc"]);
    });

    it("splits on the line count before the character limit", () => {
        const lines = Array.from({ length: 21 }, (_, index) => `line ${index}`);
        const pages = paginateLines(lines);

        assert.equal(pages.length, 2);
        assert.equal(pages[0].split("\n").length, 20);
        assert.equal(pages[1], "line 20");
    });

    it("splits on the character limit before the line count", () => {
        const lines = Array.from({ length: 6 }, () => "x".repeat(40));
        const pages = paginateLines(lines, { limit: 100 });

        for (const page of pages) {
            assert.ok(page.length <= 100, `page of ${page.length} characters`);
        }
        assert.ok(pages.length > 1);
    });

    it("loses no lines and preserves their order", () => {
        const lines = Array.from({ length: 137 }, (_, index) => `entry ${index}`);
        const pages = paginateLines(lines);

        assert.deepEqual(pages.flatMap((page) => page.split("\n")), lines);
    });

    it("clamps a line longer than a whole page instead of dropping it", () => {
        const pages = paginateLines(["fits", "z".repeat(300)], { limit: 100 });

        assert.equal(pages.length, 2);
        assert.equal(pages[0], "fits");
        assert.equal(pages[1], "z".repeat(100));
    });

    it("holds the embed description limit by default", () => {
        const lines = Array.from({ length: 400 }, (_, index) => `${index}: ${"m".repeat(300)}`);

        for (const page of paginateLines(lines)) {
            assert.ok(page.length <= EMBED_DESCRIPTION_LIMIT, `page of ${page.length} characters`);
        }
    });

    it("honors an explicit maxLines", () => {
        const pages = paginateLines(["a", "b", "c", "d", "e"], { maxLines: 2 });

        assert.deepEqual(pages, ["a\nb", "c\nd", "e"]);
    });
});
