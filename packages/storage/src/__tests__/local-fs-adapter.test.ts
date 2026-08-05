import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalFilesystemObjectStorage } from "../local-fs-adapter";

let rootDir: string;
let storage: LocalFilesystemObjectStorage;

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-test-"));
  storage = new LocalFilesystemObjectStorage({
    rootDir,
    publicBaseUrl: "http://localhost:4000/evidence",
    signingSecret: "test-secret",
  });
});

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe("LocalFilesystemObjectStorage", () => {
  it("writes and reads back an object", async () => {
    await storage.putObject({ key: "scans/s1/screenshot.png", body: Buffer.from("fake-png-bytes"), contentType: "image/png" });
    const result = await storage.getObject("scans/s1/screenshot.png");
    expect(result?.toString()).toBe("fake-png-bytes");
  });

  it("returns null for a nonexistent key", async () => {
    const result = await storage.getObject("does/not/exist.png");
    expect(result).toBeNull();
  });

  it("deletes an object", async () => {
    await storage.putObject({ key: "s1/a.png", body: Buffer.from("x"), contentType: "image/png" });
    await storage.deleteObject("s1/a.png");
    expect(await storage.getObject("s1/a.png")).toBeNull();
  });

  it("refuses to write outside the storage root (path traversal)", async () => {
    await expect(
      storage.putObject({ key: "../../etc/passwd", body: Buffer.from("x"), contentType: "text/plain" })
    ).rejects.toThrow(/outside storage root/);
  });

  it("generates a signed URL that verifies successfully before expiry", async () => {
    await storage.putObject({ key: "s1/a.png", body: Buffer.from("x"), contentType: "image/png" });
    const url = await storage.getSignedUrl("s1/a.png", 60);
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    const expires = Number(parsed.searchParams.get("expires"));

    const result = storage.verifySignedAccess("s1/a.png", expires, token);
    expect(result.valid).toBe(true);
  });

  it("rejects a signed URL after it has expired", async () => {
    const url = await storage.getSignedUrl("s1/a.png", -1); // already expired
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    const expires = Number(parsed.searchParams.get("expires"));

    const result = storage.verifySignedAccess("s1/a.png", expires, token);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("rejects a tampered token", async () => {
    const url = await storage.getSignedUrl("s1/a.png", 60);
    const parsed = new URL(url);
    const expires = Number(parsed.searchParams.get("expires"));

    const result = storage.verifySignedAccess("s1/a.png", expires, "0".repeat(64));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("invalid_signature");
  });

  it("rejects a token signed for a different key", async () => {
    const url = await storage.getSignedUrl("s1/a.png", 60);
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    const expires = Number(parsed.searchParams.get("expires"));

    const result = storage.verifySignedAccess("s1/DIFFERENT.png", expires, token);
    expect(result.valid).toBe(false);
  });

  it("deletes objects older than a given age but keeps recent ones", async () => {
    await storage.putObject({ key: "s1/old.png", body: Buffer.from("x"), contentType: "image/png" });
    const oldPath = path.join(rootDir, "s1/old.png");
    const oldTime = Date.now() - 1000 * 60 * 60 * 24 * 10; // 10 days ago
    fs.utimesSync(oldPath, oldTime / 1000, oldTime / 1000);

    await storage.putObject({ key: "s1/new.png", body: Buffer.from("y"), contentType: "image/png" });

    const deletedCount = await storage.deleteObjectsOlderThan("s1", 1000 * 60 * 60 * 24 * 7); // 7 day retention
    expect(deletedCount).toBe(1);
    expect(await storage.getObject("s1/old.png")).toBeNull();
    expect(await storage.getObject("s1/new.png")).not.toBeNull();
  });

  it("lists objects under a prefix, newest first", async () => {
    await storage.putObject({ key: "backups/a.dump", body: Buffer.from("a"), contentType: "application/octet-stream" });
    const aPath = path.join(rootDir, "backups/a.dump");
    fs.utimesSync(aPath, (Date.now() - 10_000) / 1000, (Date.now() - 10_000) / 1000);

    await storage.putObject({ key: "backups/b.dump", body: Buffer.from("bb"), contentType: "application/octet-stream" });

    const results = await storage.listObjects("backups/");
    expect(results.map((r) => r.key)).toEqual(["backups/b.dump", "backups/a.dump"]);
  });

  it("returns an empty array for a prefix with no objects", async () => {
    expect(await storage.listObjects("does-not-exist/")).toEqual([]);
  });

  it("does not include objects outside the given prefix", async () => {
    await storage.putObject({ key: "backups/a.dump", body: Buffer.from("a"), contentType: "application/octet-stream" });
    await storage.putObject({ key: "scans/s1/screenshot.png", body: Buffer.from("b"), contentType: "image/png" });

    const results = await storage.listObjects("backups/");
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("backups/a.dump");
  });
});
