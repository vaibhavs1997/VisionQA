import { Queue, QueueOptions } from "bullmq";

export const SCAN_QUEUE_NAME = "ui-quality-scans";

export interface ScanJobPayload {
  scanId: string;
  workspaceId: string;
  projectId: string;
  requestedUrl: string;
  viewports: string[];
  aiMode: "off" | "mock" | "anthropic";
}

export interface ScanJobResult {
  status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
  score?: number;
  failureReason?: string;
}

export function getRedisConnectionOptions() {
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
  };
}

let scanQueue: Queue<ScanJobPayload, ScanJobResult> | null = null;

/**
 * Shared queue singleton, same pattern as the database pool — one
 * config point (REDIS_URL) that both the API (producer) and the worker
 * (consumer) resolve identically without needing to coordinate
 * connection details separately.
 */
export function getScanQueue(options: Partial<QueueOptions> = {}): Queue<ScanJobPayload, ScanJobResult> {
  if (scanQueue) return scanQueue;
  scanQueue = new Queue<ScanJobPayload, ScanJobResult>(SCAN_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 2, // matches the Phase 0-3 CLI/worker retry policy (max 2 retries on transient failure)
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 60 * 60 * 24 }, // keep completed jobs 24h for debugging, then GC
      removeOnFail: { age: 60 * 60 * 24 * 7 }, // keep failed jobs a week — worth investigating longer
    },
    ...options,
  });
  return scanQueue;
}

export async function closeScanQueue(): Promise<void> {
  if (scanQueue) {
    await scanQueue.close();
    scanQueue = null;
  }
}

export async function enqueueScan(payload: ScanJobPayload): Promise<string> {
  const queue = getScanQueue();
  const job = await queue.add("scan", payload, { jobId: payload.scanId });
  return job.id ?? payload.scanId;
}
