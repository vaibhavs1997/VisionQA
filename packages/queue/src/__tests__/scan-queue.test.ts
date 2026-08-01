import { describe, it, expect, afterAll, afterEach } from "vitest";
import { Worker } from "bullmq";
import { getScanQueue, closeScanQueue, enqueueScan, getRedisConnectionOptions, SCAN_QUEUE_NAME, ScanJobPayload } from "../scan-queue";

// Real Redis required — no mocking. Set REDIS_URL to point elsewhere if
// the default localhost:6379 isn't where Redis is running.
const workers: Worker[] = [];

afterEach(async () => {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
  // Leftover jobs from a test that enqueues without a worker attached
  // (e.g. the idempotent-job-id test) would otherwise still be sitting
  // in Redis and get picked up by the NEXT test's worker — obliterate
  // resets the queue completely so every test starts from empty.
  const queue = getScanQueue();
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await closeScanQueue();
});

function samplePayload(overrides: Partial<ScanJobPayload> = {}): ScanJobPayload {
  return {
    scanId: `scan_${Math.random().toString(36).slice(2)}`,
    workspaceId: "ws_1",
    projectId: "proj_1",
    requestedUrl: "https://example.test",
    viewports: ["desktop"],
    aiMode: "off",
    ...overrides,
  };
}

describe("scan queue (real Redis, no mocking)", () => {
  it("enqueues a job and a worker actually receives it", async () => {
    const payload = samplePayload();
    let received: ScanJobPayload | null = null;

    const worker = new Worker<ScanJobPayload>(
      SCAN_QUEUE_NAME,
      async (job) => {
        received = job.data;
        return { status: "COMPLETED" as const };
      },
      { connection: getRedisConnectionOptions() }
    );
    workers.push(worker);

    await enqueueScan(payload);

    await new Promise<void>((resolve) => {
      worker.on("completed", () => resolve());
    });

    expect(received).toEqual(payload);
  }, 15_000);

  it("uses the scanId as the job id so re-enqueuing the same scan is idempotent", async () => {
    const payload = samplePayload();
    await enqueueScan(payload);
    const queue = getScanQueue();
    const job = await queue.getJob(payload.scanId);
    expect(job).not.toBeNull();
    expect(job?.id).toBe(payload.scanId);
  });

  it("retries a job that throws, up to the configured attempts, before failing", async () => {
    const payload = samplePayload();
    let attemptCount = 0;

    const worker = new Worker<ScanJobPayload>(
      SCAN_QUEUE_NAME,
      async () => {
        attemptCount++;
        throw new Error("simulated transient failure");
      },
      { connection: getRedisConnectionOptions() }
    );
    workers.push(worker);

    await enqueueScan(payload);

    await new Promise<void>((resolve) => {
      worker.on("failed", (job) => {
        if (job?.attemptsMade === job?.opts.attempts) resolve();
      });
    });

    expect(attemptCount).toBe(2); // matches defaultJobOptions.attempts
  }, 20_000);
});
