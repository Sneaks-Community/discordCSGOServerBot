/**
 * The wrapper every Discord call goes through. Two of its guarantees are load
 * bearing and neither is obvious from the call sites: a failed run always
 * rejects rather than resolving undefined, and a terminal error costs exactly
 * one attempt instead of a full backoff ladder.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DISCORD_GUILD_ID = "123456789012345678";
process.env.DISCORD_TOKEN = "test-token";
process.env.LOG_LEVEL = "silent";

const { withRetry } = await import("../src/utils/retry.js");

// Zero backoff throughout: these assert attempt counts, not wall-clock delays.
const NO_DELAY = { baseDelay: 0 };

/**
 * @param {number} failures - How many calls throw before one succeeds
 * @returns {{ calls: () => number, fn: () => string }}
 */
function failsThen(failures) {
    let calls = 0;

    return {
        calls: () => calls,
        fn: () => {
            calls++;
            if (calls <= failures) throw new Error(`attempt ${calls} failed`);
            return "ok";
        }
    };
}

describe("withRetry", () => {
    it("calls the operation once when it succeeds", async () => {
        const { calls, fn } = failsThen(0);

        assert.equal(await withRetry(fn, NO_DELAY), "ok");
        assert.equal(calls(), 1);
    });

    it("retries until the operation succeeds", async () => {
        const { calls, fn } = failsThen(2);

        assert.equal(await withRetry(fn, { ...NO_DELAY, maxRetries: 5 }), "ok");
        assert.equal(calls(), 3);
    });

    it("rejects with the final error once the attempts run out", async () => {
        const { calls, fn } = failsThen(Number.POSITIVE_INFINITY);

        await assert.rejects(withRetry(fn, { ...NO_DELAY, maxRetries: 3 }), /attempt 3 failed/);
        assert.equal(calls(), 3);
    });

    it("stops at the first terminal error instead of climbing the backoff", async () => {
        const terminal = new Error("permanent");
        let calls = 0;

        await assert.rejects(
            withRetry(
                () => {
                    calls++;
                    throw terminal;
                },
                { ...NO_DELAY, isRetryable: () => false, maxRetries: 5 }
            ),
            error => error === terminal
        );
        assert.equal(calls, 1);
    });

    it("hands isRetryable the error it threw", async () => {
        const thrown = new Error("classify me");
        const seen = [];

        await assert.rejects(withRetry(
            () => {
                throw thrown;
            },
            {
                ...NO_DELAY,
                isRetryable: error => {
                    seen.push(error);
                    return false;
                }
            }
        ));
        assert.deepEqual(seen, [thrown]);
    });

    it("keeps retrying while isRetryable says so", async () => {
        const { calls, fn } = failsThen(3);

        assert.equal(await withRetry(fn, { ...NO_DELAY, isRetryable: () => true, maxRetries: 4 }), "ok");
        assert.equal(calls(), 4);
    });

    // A maxRetries of 0 would skip the loop entirely and resolve undefined,
    // turning every caller into a silent no-op. The clamp is the guard.
    it("clamps a maxRetries below one to a single attempt", async () => {
        const { calls, fn } = failsThen(Number.POSITIVE_INFINITY);

        await assert.rejects(withRetry(fn, { ...NO_DELAY, maxRetries: 0 }));
        assert.equal(calls(), 1);

        const success = failsThen(0);
        assert.equal(await withRetry(success.fn, { ...NO_DELAY, maxRetries: -5 }), "ok");
        assert.equal(success.calls(), 1);
    });

    it("clamps a non-numeric maxRetries to a single attempt", async () => {
        const { calls, fn } = failsThen(Number.POSITIVE_INFINITY);

        await assert.rejects(withRetry(fn, { ...NO_DELAY, maxRetries: "many" }));
        assert.equal(calls(), 1);
    });

    it("truncates a fractional maxRetries rather than looping on it", async () => {
        const { calls, fn } = failsThen(Number.POSITIVE_INFINITY);

        await assert.rejects(withRetry(fn, { ...NO_DELAY, maxRetries: 2.9 }));
        assert.equal(calls(), 2);
    });

    it("defaults to retrying everything when no predicate is given", async () => {
        const { calls, fn } = failsThen(1);

        assert.equal(await withRetry(fn, { ...NO_DELAY, maxRetries: 2 }), "ok");
        assert.equal(calls(), 2);
    });
});
