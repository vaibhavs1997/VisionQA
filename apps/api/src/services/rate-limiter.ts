import { getRedisClient } from "@ui-quality/queue";

// Was an in-memory Map (Phase 3) — noted then as not surviving a
// process restart or working across multiple API instances. This is
// that fix: every API instance hits the same Redis, so a limit is
// actually a limit regardless of which instance served the request or
// whether one of them restarted mid-window.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const KEY_PREFIX = "ratelimit:";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export interface RateLimitOptions {
  windowMs?: number;
  maxPerWindow?: number;
}

// INCR + PEXPIRE-on-first-increment, as one atomic Lua script — doing
// this as two separate commands (INCR then check-and-EXPIRE) has a race:
// two requests arriving in the same millisecond could both see count===1
// and both set the expiry, which is harmless, but a crash or slow client
// between the two commands could leave a key with no expiry at all,
// leaking memory forever. The script closes that gap.
const INCR_AND_MAYBE_EXPIRE = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return current
`;

/**
 * Fails OPEN, not closed: if Redis is unreachable, requests are allowed
 * through rather than rejected. A rate limiter that takes down the
 * entire API when its own backing store hiccups is a worse outcome
 * than temporarily under-enforcing a limit — same reasoning as the
 * broken-link and SEO checks elsewhere in this codebase being
 * best-effort rather than hard dependencies of the thing they support.
 */
export async function checkRateLimit(key: string, action: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const maxPerWindow = options.maxPerWindow ?? MAX_PER_WINDOW;
  const bucketKey = `${KEY_PREFIX}${action}:${key}`;

  try {
    const redis = getRedisClient();
    const current = (await redis.eval(INCR_AND_MAYBE_EXPIRE, 1, bucketKey, windowMs)) as number;

    if (current > maxPerWindow) {
      const ttl = await redis.pttl(bucketKey);
      return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs };
    }
    return { allowed: true };
  } catch (err) {
    console.warn(`Rate limiter: Redis unavailable, failing open for "${action}":`, err instanceof Error ? err.message : err);
    return { allowed: true };
  }
}

/** Test/dev helper — clears all rate-limit state. */
export async function resetRateLimits(): Promise<void> {
  const redis = getRedisClient();
  const keys = await redis.keys(`${KEY_PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
}
