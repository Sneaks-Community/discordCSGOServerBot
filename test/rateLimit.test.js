/**
 * The per-user, per-action budget standing between one impatient user and a
 * flood of Discord calls. The invariant worth protecting is that a refusal
 * costs nothing: if a rejected attempt recorded a timestamp, the window would
 * keep sliding forward and a rate-limited user could never recover.
 *
 * Each test uses its own user id, since the buckets live in a module-level map.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";

const { checkRateLimit } = await import("../src/services/cacheService.js");

const FOLLOW = "follow";
const UNFOLLOW = "unfollow";

describe("checkRateLimit", () => {
    it("allows exactly the limit, then refuses", () => {
        const user = "500000000000000001";

        for (let i = 0; i < 3; i++) {
            assert.deepEqual(checkRateLimit(user, FOLLOW, 3), { allowed: true, retryAfter: 0 }, `call ${i + 1} should be allowed`);
        }

        assert.deepEqual(checkRateLimit(user, FOLLOW, 3), { allowed: false, retryAfter: 60 });
    });

    it("reports a retryAfter inside the one-minute window", () => {
        const user = "500000000000000002";

        checkRateLimit(user, FOLLOW, 1);
        const { retryAfter } = checkRateLimit(user, FOLLOW, 1);

        assert.ok(retryAfter > 0 && retryAfter <= 60, `retryAfter was ${retryAfter}`);
    });

    it("does not charge a refused attempt against the budget", () => {
        const user = "500000000000000003";

        assert.equal(checkRateLimit(user, FOLLOW, 1).allowed, true);
        assert.equal(checkRateLimit(user, FOLLOW, 1).allowed, false);
        assert.equal(checkRateLimit(user, FOLLOW, 1).allowed, false);

        // Only the one allowed call was ever recorded, so a limit of two still
        // has a slot free. A refusal that pushed a timestamp would fail here.
        assert.equal(checkRateLimit(user, FOLLOW, 2).allowed, true);
    });

    it("keeps one bucket per action", () => {
        const user = "500000000000000004";

        assert.equal(checkRateLimit(user, FOLLOW, 1).allowed, true);
        assert.equal(checkRateLimit(user, FOLLOW, 1).allowed, false);
        assert.equal(checkRateLimit(user, UNFOLLOW, 1).allowed, true);
    });

    it("keeps one bucket per user", () => {
        const user = "500000000000000005";
        const other = "500000000000000006";

        assert.equal(checkRateLimit(user, FOLLOW, 1).allowed, true);
        assert.equal(checkRateLimit(user, FOLLOW, 1).allowed, false);
        assert.equal(checkRateLimit(other, FOLLOW, 1).allowed, true);
    });

    it("honours a raised limit for a user already at the old one", () => {
        const user = "500000000000000007";

        checkRateLimit(user, FOLLOW, 2);
        checkRateLimit(user, FOLLOW, 2);
        assert.equal(checkRateLimit(user, FOLLOW, 2).allowed, false);
        assert.equal(checkRateLimit(user, FOLLOW, 5).allowed, true);
    });
});
