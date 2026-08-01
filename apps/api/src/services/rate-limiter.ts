interface Bucket {
  count: number;
  windowStartedAt: number;
}

const buckets = new Map<string, Bucket>();

// Deliberately generous for a Phase 3 demo — the point is to have a real,
// working rate-limit seam (matching the spec's "rate limit scan creation
// by user/session/IP" requirement) rather than to tune production
// thresholds, which depend on real traffic data this phase doesn't have
// yet. A distributed deployment (Phase 4) will need this backed by Redis
// instead of an in-memory Map, since this doesn't survive a process
// restart or work across multiple API instances — noted here rather than
// silently assumed to scale.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export function checkRateLimit(key: string, action: string): RateLimitResult {
  const bucketKey = `${action}:${key}`;
  const now = Date.now();
  const bucket = buckets.get(bucketKey);

  if (!bucket || now - bucket.windowStartedAt >= WINDOW_MS) {
    buckets.set(bucketKey, { count: 1, windowStartedAt: now });
    return { allowed: true };
  }

  if (bucket.count >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - bucket.windowStartedAt) };
  }

  bucket.count++;
  return { allowed: true };
}

/** Test/dev helper — clears all rate-limit state. */
export function resetRateLimits(): void {
  buckets.clear();
}
