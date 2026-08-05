import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalFilesystemObjectStorage } from "@ui-quality/storage";
import { runRestore } from "../restore";

let rootDir: string;
let storage: LocalFilesystemObjectStorage;

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-test-"));
  storage = new LocalFilesystemObjectStorage({ rootDir, publicBaseUrl: "unused", signingSecret: "test-secret" });
});

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe("runRestore", () => {
  it("restores the newest backup when no key is given", async () => {
    await storage.putObject({ key: "backups/old.dump", body: Buffer.from("old-bytes"), contentType: "application/octet-stream" });
    const oldPath = path.join(rootDir, "backups/old.dump");
    const oldTime = (Date.now() - 10_000) / 1000;
    fs.utimesSync(oldPath, oldTime, oldTime);
    await storage.putObject({ key: "backups/new.dump", body: Buffer.from("new-bytes"), contentType: "application/octet-stream" });

    const runRestoreFn = vi.fn().mockResolvedValue(undefined);
    const result = await runRestore({ databaseUrl: "postgres://fake", storage, runRestore: runRestoreFn });

    expect(result.key).toBe("backups/new.dump");
    expect(runRestoreFn).toHaveBeenCalledWith("postgres://fake", expect.stringContaining("ui-quality-restore-"));
  });

  it("restores a specific key when given", async () => {
    await storage.putObject({ key: "backups/a.dump", body: Buffer.from("a"), contentType: "application/octet-stream" });
    await storage.putObject({ key: "backups/b.dump", body: Buffer.from("b"), contentType: "application/octet-stream" });

    const runRestoreFn = vi.fn().mockResolvedValue(undefined);
    const result = await runRestore({ databaseUrl: "postgres://fake", storage, key: "backups/a.dump", runRestore: runRestoreFn });

    expect(result.key).toBe("backups/a.dump");
  });

  it("throws when no backups exist and no key is given", async () => {
    await expect(runRestore({ databaseUrl: "postgres://fake", storage, runRestore: vi.fn() })).rejects.toThrow(/No backups found/);
  });

  it("throws when the given key doesn't exist", async () => {
    await expect(
      runRestore({ databaseUrl: "postgres://fake", storage, key: "backups/nope.dump", runRestore: vi.fn() })
    ).rejects.toThrow(/Backup not found/);
  });

  it("cleans up the temp file after a successful restore", async () => {
    await storage.putObject({ key: "backups/a.dump", body: Buffer.from("a"), contentType: "application/octet-stream" });
    let capturedPath = "";
    const runRestoreFn = vi.fn().mockImplementation(async (_url: string, dumpPath: string) => {
      capturedPath = dumpPath;
      expect(fs.existsSync(dumpPath)).toBe(true);
    });

    await runRestore({ databaseUrl: "postgres://fake", storage, runRestore: runRestoreFn });
    expect(fs.existsSync(capturedPath)).toBe(false);
  });

  it("cleans up the temp file even when the restore runner throws", async () => {
    await storage.putObject({ key: "backups/a.dump", body: Buffer.from("a"), contentType: "application/octet-stream" });
    let capturedPath = "";
    const runRestoreFn = vi.fn().mockImplementation(async (_url: string, dumpPath: string) => {
      capturedPath = dumpPath;
      throw new Error("pg_restore failed");
    });

    await expect(runRestore({ databaseUrl: "postgres://fake", storage, runRestore: runRestoreFn })).rejects.toThrow("pg_restore failed");
    expect(fs.existsSync(capturedPath)).toBe(false);
  });
});
