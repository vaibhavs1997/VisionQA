import Redis from "ioredis";
import { getRedisConnectionOptions } from "./scan-queue";

let client: Redis | null = null;

/**
 * A raw ioredis client, separate from the BullMQ `Queue` connection in
 * `scan-queue.ts` — BullMQ manages its own connection lifecycle
 * internally and isn't meant to be borrowed for arbitrary commands, so
 * anything that needs plain Redis commands (right now: the API's rate
 * limiter) gets its own client here instead. Still resolves
 * `REDIS_URL` through the same `getRedisConnectionOptions()` as the
 * queue, so there's exactly one config point either way.
 */
export function getRedisClient(): Redis {
  if (client) return client;
  client = new Redis({
    ...getRedisConnectionOptions(),
    // Tuned differently from BullMQ's queue connection on purpose: job
    // processing can reasonably wait out a Redis blip, but the rate
    // limiter's whole fail-open guarantee (see checkRateLimit) depends
    // on failures surfacing FAST. ioredis's default is up to 20 retries
    // per command with backoff before giving up, which can take many
    // seconds — during an outage that would make every single API
    // request hang for that long before "failing open," which is worse
    // than not having a timeout-aware fail-open at all.
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
  });
  return client;
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    // disconnect() rather than quit() — quit() sends a command and
    // waits for a reply, which can itself hang/reject if the connection
    // is already broken (exactly the situation this gets called from
    // in the rate limiter's own fail-open test). disconnect() just
    // tears down the socket immediately, no round-trip required.
    client.disconnect();
    client = null;
  }
}
