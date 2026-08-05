import { Queue } from "bullmq";
import pg from "pg";

const scanId = process.argv[2];
if (!scanId) {
  console.error("Usage: node scripts/cancel-scan.mjs <scanId>");
  process.exit(1);
}

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6380");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const queue = new Queue("ui-quality-scans", {
  connection: {
    host: redisUrl.hostname,
    port: Number.parseInt(redisUrl.port || "6379", 10),
    password: redisUrl.password || undefined,
  },
});

try {
  const job = await queue.getJob(scanId);
  if (job) {
    const state = await job.getState();
    console.log("queue job state:", state);
    if (state === "waiting" || state === "delayed") {
      await job.remove();
    } else if (state === "active") {
      await job.discard();
    }
  } else {
    console.log("no queue job for scan id");
  }

  const result = await pool.query(
    `UPDATE scans
     SET status = 'FAILED', failure_reason = 'Cancelled by user', completed_at = now()
     WHERE id = $1 AND status NOT IN ('COMPLETED', 'PARTIALLY_COMPLETED')
     RETURNING id, status, failure_reason`,
    [scanId]
  );
  if (result.rowCount === 0) {
    const existing = await pool.query("SELECT id, status FROM scans WHERE id = $1", [scanId]);
    console.log("scan not updated:", existing.rows[0] ?? "not found");
  } else {
    console.log("scan updated:", result.rows[0]);
  }
} finally {
  await pool.end();
  await queue.close();
}
