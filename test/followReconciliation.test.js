/**
 * The pure half only: inverting this membership test prunes exactly the members
 * who are still here.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";

const { selectDepartedFollowers } = await import("../src/services/followReconciliation.js");

const PRESENT = "100000000000000001";
const ALSO_PRESENT = "100000000000000002";
const DEPARTED = "200000000000000001";
const ALSO_DEPARTED = "200000000000000002";

describe("selectDepartedFollowers", () => {
    it("returns only the followers missing from the member list", () => {
        const departed = selectDepartedFollowers(
            [PRESENT, DEPARTED, ALSO_PRESENT, ALSO_DEPARTED],
            new Set([PRESENT, ALSO_PRESENT])
        );

        assert.deepEqual(departed, [DEPARTED, ALSO_DEPARTED]);
    });

    it("returns nothing when every follower is still a member", () => {
        assert.deepEqual(selectDepartedFollowers([PRESENT, ALSO_PRESENT], new Set([PRESENT, ALSO_PRESENT])), []);
    });

    it("ignores members who follow nothing", () => {
        assert.deepEqual(selectDepartedFollowers([PRESENT], new Set([PRESENT, ALSO_PRESENT, DEPARTED])), []);
    });

    it("returns nothing for an empty follower list, whatever the guild holds", () => {
        assert.deepEqual(selectDepartedFollowers([], new Set([PRESENT])), []);
    });

    it("reports every follower when the member set is empty", () => {
        assert.deepEqual(selectDepartedFollowers([PRESENT, DEPARTED], new Set()), [PRESENT, DEPARTED]);
    });

    it("compares ids as strings, so a numeric snowflake is not treated as present", () => {
        assert.deepEqual(selectDepartedFollowers([PRESENT], new Set([Number(PRESENT)])), [PRESENT]);
    });

    it("preserves input order", () => {
        assert.deepEqual(selectDepartedFollowers([ALSO_DEPARTED, PRESENT, DEPARTED], new Set([PRESENT])), [ALSO_DEPARTED, DEPARTED]);
    });
});
