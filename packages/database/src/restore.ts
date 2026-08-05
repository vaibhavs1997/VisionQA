import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalFilesystemObjectStorage, S3ObjectStorage, ObjectStorage } from "@ui-quality/storage";

export interface RestoreOptions {
  databaseUrl: string;
  storage: ObjectStorage;
  /** Restores this specific backup key; omit to restore the newest
   * available backup. */
  key?: string;
  runRestore?: (databaseUrl: string, dumpPath: string) => Promise<void>;
}

export interface RestoreResult {
  key: string;
  sizeBytes: number;
}

const BACKUP_KEY_PREFIX = "backups/";

async function resolveLatestBackupKey(storage: ObjectStorage): Promise<string> {
  const backups = await storage.listObjects(BACKUP_KEY_PREFIX);
  if (backups.length === 0) throw new Error("No backups found.");
  return backups[0].key; // listObjects returns newest-first
}

/**
 * Runs `pg_restore --clean --if-exists` against a dump file already on
 * disk. `--clean --if-exists` drops existing objects before recreating
 * them, which is what makes this a true point-in-time restore rather
 * than an additive merge — and exactly why the CLI entrypoint below
 * refuses to run this without an explicit `--yes` flag.
 */
export function spawnPgRestore(databaseUrl: string, dumpPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "-d", databaseUrl, dumpPath]);
    let stderr = "";

    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (err) => {
      reject(new Error(`Failed to start pg_restore — is postgresql-client installed? (${err.message})`));
    });
    child.on("close", (code) => {
      // pg_restore exits 1 on warnings (e.g. "role does not exist" for
      // --no-owner) even on an otherwise-successful restore — only
      // treat unexpected higher exit codes as a hard failure.
      if (code === 0 || code === 1) resolve();
      else reject(new Error(`pg_restore exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Resolves which backup to restore (latest, or a specific key), writes
 * it to a temp file (pg_restore's custom format needs random file
 * access, not a stdin stream), runs the restore, and cleans up the
 * temp file whether the restore succeeded or not.
 */
export async function runRestore(options: RestoreOptions): Promise<RestoreResult> {
  const runner = options.runRestore ?? spawnPgRestore;
  const key = options.key ?? (await resolveLatestBackupKey(options.storage));

  const body = await options.storage.getObject(key);
  if (!body) throw new Error(`Backup not found: ${key}`);

  const tempPath = path.join(os.tmpdir(), `ui-quality-restore-${Date.now()}.dump`);
  fs.writeFileSync(tempPath, body);
  try {
    await runner(options.databaseUrl, tempPath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  return { key, sizeBytes: body.length };
}

function buildStorageFromEnv(): ObjectStorage {
  // Same selection logic as backup.ts's buildStorageFromEnv — see that
  // file's comment for why. Kept as a literal duplicate (not a shared
  // helper) since these two CLIs are meant to be readable and correct
  // in isolation, without having to trace into each other.
  if (process.env.BACKUP_S3_BUCKET) {
    return new S3ObjectStorage({
      bucket: process.env.BACKUP_S3_BUCKET,
      region: process.env.BACKUP_S3_REGION ?? "us-east-1",
      endpoint: process.env.BACKUP_S3_ENDPOINT,
    });
  }

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

  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const keyArg = args.find((a) => a.startsWith("--key="))?.split("=")[1];

  if (!confirmed) {
    console.error(
      "This will DROP and recreate every object in the target database from a backup " +
        "(pg_restore --clean --if-exists) — this is destructive and cannot be undone.\n" +
        "Re-run with --yes to proceed" +
        (keyArg ? ` (restoring ${keyArg}).` : ", restoring the newest available backup.")
    );
    process.exit(1);
  }

  runRestore({ databaseUrl, storage: buildStorageFromEnv(), key: keyArg })
    .then((result) => {
      const sizeMb = (result.sizeBytes / 1_000_000).toFixed(2);
      // eslint-disable-next-line no-console
      console.log(`Restore complete from ${result.key} (${sizeMb} MB).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Restore failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
