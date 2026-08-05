import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../services/rate-limiter";
import { closeRedisClient } from "@ui-quality/queue";

/**
 * Deliberately its own file, separate from rate-limiter.test.ts — that
 * file's `afterEach` calls `resetRateLimits()`, which itself needs real
 * Redis and would throw in exactly the unreachable-Redis situation this
 * file is testing. This is the one rate-limiter test meant to pass in
 * ANY environment, Redis available or not, because it's testing the
 * failure path itself.
 */
describe("checkRateLimit fails open quickly when Redis is unreachable", () => {
  it("allows the request and returns quickly rather than hanging through ioredis's default retry backoff", async () => {
    const unreachableRedisUrl = "redis://127.0.0.1:1"; // nothing listens on port 1
    const previous = process.env.REDIS_URL;

    // getRedisClient() is a singleton that only reads REDIS_URL the
    // first time it's constructed, so the existing client (whatever it
    // is) has to be torn down first for a fresh one to actually pick up
    // the unreachable URL below.
    await closeRedisClient();
    process.env.REDIS_URL = unreachableRedisUrl;

    try {
      const started = Date.now();
      const result = await checkRateLimit(`test-${Math.random()}`, "test_action");
      const elapsedMs = Date.now() - started;

      expect(result.allowed).toBe(true);
      // Generous upper bound — the point isn't a precise SLA, it's
      // proving this doesn't take the 10+ seconds ioredis's default 20
      // retries-with-backoff would take.
      expect(elapsedMs).toBeLessThan(5000);
    } finally {
      // Assigning `undefined` to process.env coerces to the literal
      // string "undefined" rather than unsetting the key — has to be
      // an actual delete when there was no previous value.
      if (previous === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previous;
      await closeRedisClient();
    }
  }, 8000);
});
