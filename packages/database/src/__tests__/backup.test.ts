import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalFilesystemObjectStorage } from "@ui-quality/storage";
import { runBackup } from "../maintenance/backup";

let rootDir: string;
let storage: LocalFilesystemObjectStorage;

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
  storage = new LocalFilesystemObjectStorage({ rootDir, publicBaseUrl: "unused", signingSecret: "test-secret" });
});

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe("runBackup", () => {
  it("uploads the dump under backups/ with a timestamped key", async () => {
    const runDump = vi.fn().mockResolvedValue(Buffer.from("fake-dump-bytes"));
    const fixedNow = () => new Date("2026-03-01T12:00:00.000Z");

    const result = await runBackup({ databaseUrl: "postgres://fake", storage, runDump, now: fixedNow });

    expect(result.key).toBe("backups/2026-03-01T12-00-00-000Z.dump");
    expect(result.sizeBytes).toBe(Buffer.from("fake-dump-bytes").length);
    expect((await storage.getObject(result.key))?.toString()).toBe("fake-dump-bytes");
  });

  it("passes the given databaseUrl through to the dump runner", async () => {
    const runDump = vi.fn().mockResolvedValue(Buffer.from("x"));
    await runBackup({ databaseUrl: "postgres://specific-db", storage, runDump });
    expect(runDump).toHaveBeenCalledWith("postgres://specific-db");
  });

  it("applies retention AFTER the new backup is uploaded, never leaving zero backups on a successful run", async () => {
    // Seed an old backup that should get cleaned up.
    await storage.putObject({ key: "backups/old.dump", body: Buffer.from("old"), contentType: "application/octet-stream" });
    const oldPath = path.join(rootDir, "backups/old.dump");
    const oldTime = (Date.now() - 1000 * 60 * 60 * 24 * 40) / 1000; // 40 days ago
    fs.utimesSync(oldPath, oldTime, oldTime);

    const runDump = vi.fn().mockResolvedValue(Buffer.from("new-dump"));
    const result = await runBackup({
      databaseUrl: "postgres://fake",
      storage,
      runDump,
      retentionMs: 1000 * 60 * 60 * 24 * 30, // 30 day retention
    });

    expect(result.deletedOldBackups).toBe(1);
    expect(await storage.getObject("backups/old.dump")).toBeNull();
    expect(await storage.getObject(result.key)).not.toBeNull();
  });

  it("does NOT run retention if the dump itself fails", async () => {
    await storage.putObject({ key: "backups/old.dump", body: Buffer.from("old"), contentType: "application/octet-stream" });
    const oldPath = path.join(rootDir, "backups/old.dump");
    const oldTime = (Date.now() - 1000 * 60 * 60 * 24 * 40) / 1000;
    fs.utimesSync(oldPath, oldTime, oldTime);

    const runDump = vi.fn().mockRejectedValue(new Error("pg_dump failed"));

    await expect(
      runBackup({ databaseUrl: "postgres://fake", storage, runDump, retentionMs: 1000 * 60 * 60 * 24 * 30 })
    ).rejects.toThrow("pg_dump failed");

    // The old backup must still be there — a failed dump should never
    // reduce the number of restorable backups.
    expect(await storage.getObject("backups/old.dump")).not.toBeNull();
  });
});
