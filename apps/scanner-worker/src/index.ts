import http from "node:http";
import { Pool } from "pg";
import { Worker } from "bullmq";
import { loadEnvFile } from "./load-env";
import { SCAN_QUEUE_NAME, getRedisConnectionOptions, ScanJobPayload, ScanJobResult, getScanQueue } from "@ui-quality/queue";
import { LocalFilesystemObjectStorage } from "@ui-quality/storage";
import { updateScanProgress } from "@ui-quality/database";
import { createLogger, createMetricsRegistry } from "@ui-quality/observability";
import { processScanJob } from "./process-scan-job";

const CONCURRENCY = Number.parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10);
const METRICS_PORT = Number.parseInt(process.env.METRICS_PORT ?? "9091", 10);
const QUEUE_DEPTH_POLL_MS = 10_000;

async function main() {
  loadEnvFile();
  const logger = createLogger({ service: "scanner-worker" });
  const metrics = createMetricsRegistry();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const storage = new LocalFilesystemObjectStorage({
    rootDir: process.env.STORAGE_ROOT_DIR ?? "./storage-data",
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? "http://localhost:4000/evidence",
    signingSecret: process.env.STORAGE_SIGNING_SECRET,
  });
  const chromiumExecutablePath = process.env.UI_SCAN_CHROMIUM_PATH;

  // A background worker still needs to be scraped by Prometheus — this
  // is a minimal HTTP server just for that, separate from the API's own
  // (much larger) Fastify instance.
  const metricsServer = http.createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.writeHead(200, { "Content-Type": metrics.registry.contentType });
      res.end(await metrics.registry.metrics());
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  metricsServer.listen(METRICS_PORT);

  const queueDepthInterval = setInterval(async () => {
    try {
      const counts = await getScanQueue().getJobCounts("waiting", "active");
      metrics.queueDepth.set((counts.waiting ?? 0) + (counts.active ?? 0));
    } catch {
      // transient Redis hiccup — next tick will retry, not worth logging
    }
  }, QUEUE_DEPTH_POLL_MS);

  const worker = new Worker<ScanJobPayload, ScanJobResult>(
    SCAN_QUEUE_NAME,
    async (job) => {
      logger.info({ scanId: job.data.scanId, jobId: job.id, attempt: job.attemptsMade + 1 }, "starting scan");
      try {
        return await processScanJob(job.data, { pool, storage, chromiumExecutablePath, logger, metrics });
      } catch (err) {
        // A failure this deep (not caught inside processScanJob itself,
        // e.g. a Postgres connection drop) still needs the scan row
        // marked FAILED — best-effort, since the db/connection that just
        // failed is exactly what we're trying to write to.
        await updateScanProgress(pool, job.data.scanId, { status: "FAILED" }).catch(() => {});
        throw err;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: CONCURRENCY,
    }
  );

  worker.on("completed", (job, result) => {
    logger.info({ scanId: job.data.scanId, status: result.status }, "scan job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ scanId: job?.data.scanId, attempt: job?.attemptsMade, err: err.message }, "scan job failed");
  });

  logger.info({ concurrency: CONCURRENCY, metricsPort: METRICS_PORT }, `listening on queue "${SCAN_QUEUE_NAME}"`);

  const shutdown = async () => {
    logger.info({}, "shutting down");
    clearInterval(queueDepthInterval);
    await worker.close();
    await pool.end();
    metricsServer.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[scanner-worker] fatal startup error:", err);
  process.exit(1);
});
