import { spawn } from "node:child_process";
import { LocalFilesystemObjectStorage, S3ObjectStorage, ObjectStorage } from "@ui-quality/storage";

export interface BackupResult {
  key: string;
  sizeBytes: number;
  deletedOldBackups: number;
}

export interface BackupOptions {
  databaseUrl: string;
  storage: ObjectStorage;
  /** Backups older than this are deleted after a successful new backup
   * completes — never before, so a retention run can't leave zero
   * backups if the new dump itself fails. Default 30 days. */
  retentionMs?: number;
  /** Injectable so the orchestration logic (key naming, upload,
   * retention) is unit-testable without a real `pg_dump` binary on
   * PATH — the real CLI entrypoint below wires in `spawnPgDump`. */
  runDump?: (databaseUrl: string) => Promise<Buffer>;
  now?: () => Date;
}

const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const BACKUP_KEY_PREFIX = "backups/";

/**
 * Runs `pg_dump` in custom format (`-Fc`) and returns the dump as a
 * Buffer via stdout, rather than writing to a temp file first — one
 * less thing to clean up, and this project's other external-process
 * calls (Playwright's browser process) follow the same "collect
 * output, don't touch disk unnecessarily" shape.
 *
 * Requires the `postgresql-client` package (specifically `pg_dump`) to
 * be on PATH in whatever environment runs this — NOT bundled with the
 * `pg` npm driver, which is a pure-JS wire-protocol client with no
 * dump/restore functionality of its own. See the README's ops runbook
 * for what to install where.
 */
export function spawnPgDump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", [databaseUrl, "--format=custom", "--no-owner", "--no-privileges"]);
    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (err) => {
      reject(new Error(`Failed to start pg_dump — is postgresql-client installed? (${err.message})`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`pg_dump exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Dumps the database, uploads it to object storage under `backups/`,
 * then deletes backups older than the retention window. Retention runs
 * AFTER the new backup is confirmed uploaded — never before — so a
 * failed dump can't leave the backup set empty.
 */
export async function runBackup(options: BackupOptions): Promise<BackupResult> {
  const runDump = options.runDump ?? spawnPgDump;
  const now = options.now ?? (() => new Date());
  const retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;

  const dump = await runDump(options.databaseUrl);
  const timestamp = now().toISOString().replace(/[:.]/g, "-");
  const key = `${BACKUP_KEY_PREFIX}${timestamp}.dump`;

  await options.storage.putObject({ key, body: dump, contentType: "application/octet-stream" });
  const deletedOldBackups = await options.storage.deleteObjectsOlderThan(BACKUP_KEY_PREFIX, retentionMs);

  return { key, sizeBytes: dump.length, deletedOldBackups };
}

function buildStorageFromEnv(): ObjectStorage {
  // Scheduled backups (e.g. a GitHub Actions cron) run on an ephemeral
  // runner with no persistent disk — LocalFilesystemObjectStorage would
  // write a "backup" that vanishes the moment the job ends, which is
  // worse than not backing up at all (false confidence). Set
  // BACKUP_S3_BUCKET to target durable storage instead. S3ObjectStorage
  // itself is a documented, reviewed-but-unverified stub (see
  // packages/storage/src/s3-adapter.ts) — selecting it here without
  // finishing that implementation fails loudly and immediately, which
  // is the correct failure mode: better than silently writing backups
  // nowhere durable.
  if (process.env.BACKUP_S3_BUCKET) {
    return new S3ObjectStorage({
      bucket: process.env.BACKUP_S3_BUCKET,
      region: process.env.BACKUP_S3_REGION ?? "us-east-1",
      endpoint: process.env.BACKUP_S3_ENDPOINT,
    });
  }

  // Same storage root the rest of the app already uses (evidence
  // screenshots live under scans/*, backups live under backups/) —
  // simplest to operate as one bucket/root with prefix separation,
  // matching common S3 bucket conventions. For stronger isolation
  // (backups surviving even if evidence storage is compromised or
  // wiped), point BACKUP_STORAGE_ROOT_DIR at a genuinely separate
  // location/bucket instead — the code doesn't assume they're the same.
  const rootDir = process.env.BACKUP_STORAGE_ROOT_DIR ?? process.env.STORAGE_ROOT_DIR ?? "./data/storage";
  return new LocalFilesystemObjectStorage({
    rootDir,
    publicBaseUrl: "unused-for-backups",
    signingSecret: process.env.STORAGE_SIGNING_SECRET,
  });
}

if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const retentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10);
  const retentionMs = (Number.isNaN(retentionDays) ? 30 : retentionDays) * 24 * 60 * 60 * 1000;

  runBackup({ databaseUrl, storage: buildStorageFromEnv(), retentionMs })
    .then((result) => {
      const sizeMb = (result.sizeBytes / 1_000_000).toFixed(2);
      // eslint-disable-next-line no-console
      console.log(`Backup complete: ${result.key} (${sizeMb} MB). Deleted ${result.deletedOldBackups} backup(s) past the retention window.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Backup failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
