import { describe, it, expect, afterAll, afterEach } from "vitest";
import { checkRateLimit, resetRateLimits } from "../services/rate-limiter";

// Real Redis required — no mocking, same convention as
// packages/queue/src/__tests__/scan-queue.test.ts. Set REDIS_URL to
// point elsewhere if the default localhost:6379 isn't where Redis is
// running.

afterEach(async () => {
  await resetRateLimits();
});

describe("checkRateLimit (real Redis, no mocking)", () => {
  it("allows requests up to the configured max within a window", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key, "test_action", { windowMs: 5000, maxPerWindow: 5 });
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the request once the max is exceeded within the window", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(key, "test_action", { windowMs: 5000, maxPerWindow: 5 });
    }
    const result = await checkRateLimit(key, "test_action", { windowMs: 5000, maxPerWindow: 5 });
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(5000);
  });

  it("tracks different keys independently", async () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(keyA, "test_action", { windowMs: 5000, maxPerWindow: 5 });
    }
    // keyA is now at its limit, but keyB has made zero requests yet.
    const resultA = await checkRateLimit(keyA, "test_action", { windowMs: 5000, maxPerWindow: 5 });
    const resultB = await checkRateLimit(keyB, "test_action", { windowMs: 5000, maxPerWindow: 5 });
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("tracks different actions independently for the same key", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(key, "action_a", { windowMs: 5000, maxPerWindow: 5 });
    }
    const resultA = await checkRateLimit(key, "action_a", { windowMs: 5000, maxPerWindow: 5 });
    const resultB = await checkRateLimit(key, "action_b", { windowMs: 5000, maxPerWindow: 5 });
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("allows requests again after the window expires", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(key, "test_action", { windowMs: 300, maxPerWindow: 3 });
    }
    const blocked = await checkRateLimit(key, "test_action", { windowMs: 300, maxPerWindow: 3 });
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 400));

    const afterWindow = await checkRateLimit(key, "test_action", { windowMs: 300, maxPerWindow: 3 });
    expect(afterWindow.allowed).toBe(true);
  });

  it("resetRateLimits clears state for a subsequent check", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(key, "test_action", { windowMs: 5000, maxPerWindow: 5 });
    }
    await resetRateLimits();
    const result = await checkRateLimit(key, "test_action", { windowMs: 5000, maxPerWindow: 5 });
    expect(result.allowed).toBe(true);
  });
});
