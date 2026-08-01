import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runMigrations,
  createUser,
  createWorkspaceWithOwner,
  createProject,
  createScan as dbCreateScan,
  getScan,
  getScanPages,
  getIssuesForScan,
} from "@ui-quality/database";
import { LocalFilesystemObjectStorage } from "@ui-quality/storage";
import { processScanJob } from "../process-scan-job";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://uiquality:uiquality_dev@localhost:5432/ui_quality_test";

// Real Chromium, real Postgres, real filesystem storage — no mocking.
// Requires UI_SCAN_CHROMIUM_PATH to point at a real Chromium binary.
describe.skipIf(!process.env.UI_SCAN_CHROMIUM_PATH)("processScanJob (real Postgres + Chromium + storage)", () => {
  let pool: Pool;
  let storageDir: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    await runMigrations(pool, `${__dirname}/../../../../packages/database/migrations`);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE users, workspaces, workspace_members, projects, scans, scan_pages, issues, usage_events CASCADE`
    );
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-storage-"));
  });

  it("scans a real public URL end-to-end and persists issues + screenshots", async () => {
    const user = await createUser(pool, { email: "worker-test@example.com", passwordHash: "h", passwordSalt: "s" });
    const workspace = await createWorkspaceWithOwner(pool, { name: "Worker Test WS", ownerId: user.id });
    const project = await createProject(pool, {
      workspaceId: workspace.id,
      name: "GitHub",
      baseUrl: "https://github.com/anthropics",
    });
    const scan = await dbCreateScan(pool, {
      projectId: project.id,
      workspaceId: workspace.id,
      requestedUrl: "https://github.com/anthropics",
      viewports: ["desktop"],
      aiMode: "off",
    });

    const storage = new LocalFilesystemObjectStorage({
      rootDir: storageDir,
      publicBaseUrl: "http://localhost:4000/evidence",
      signingSecret: "test-secret",
    });

    const result = await processScanJob(
      {
        scanId: scan.id,
        workspaceId: workspace.id,
        projectId: project.id,
        requestedUrl: "https://github.com/anthropics",
        viewports: ["desktop"],
        aiMode: "off",
      },
      { pool, storage, chromiumExecutablePath: process.env.UI_SCAN_CHROMIUM_PATH }
    );

    expect(["COMPLETED", "PARTIALLY_COMPLETED"]).toContain(result.status);
    expect(result.score).toBeGreaterThanOrEqual(0);

    const persistedScan = await getScan(pool, workspace.id, scan.id);
    expect(persistedScan?.status).toBe(result.status);
    expect(persistedScan?.finalUrl).toContain("github.com");

    const pages = await getScanPages(pool, scan.id);
    expect(pages).toHaveLength(1);
    expect(pages[0].screenshotStorageKeys.length).toBeGreaterThan(0);

    // The screenshots must actually be retrievable from object storage —
    // not just recorded as keys.
    for (const key of pages[0].screenshotStorageKeys) {
      const bytes = await storage.getObject(key);
      expect(bytes).not.toBeNull();
      expect(bytes!.length).toBeGreaterThan(0);
    }

    const issues = await getIssuesForScan(pool, workspace.id, scan.id, {});
    // github.com's CDN assets are outside this sandbox's network
    // allowlist (see README) — expect real failed-resource/broken-image
    // findings, same artifact documented in every earlier phase's tests.
    expect(issues.length).toBeGreaterThan(0);
  }, 60_000);

  it("marks the scan FAILED when the URL is rejected by the security guard", async () => {
    const user = await createUser(pool, { email: "worker-test2@example.com", passwordHash: "h", passwordSalt: "s" });
    const workspace = await createWorkspaceWithOwner(pool, { name: "WS", ownerId: user.id });
    const project = await createProject(pool, { workspaceId: workspace.id, name: "P", baseUrl: "http://localhost:1234" });
    const scan = await dbCreateScan(pool, {
      projectId: project.id,
      workspaceId: workspace.id,
      requestedUrl: "http://localhost:1234",
      viewports: ["desktop"],
      aiMode: "off",
    });

    const storage = new LocalFilesystemObjectStorage({
      rootDir: storageDir,
      publicBaseUrl: "http://localhost:4000/evidence",
      signingSecret: "test-secret",
    });

    const result = await processScanJob(
      {
        scanId: scan.id,
        workspaceId: workspace.id,
        projectId: project.id,
        requestedUrl: "http://localhost:1234",
        viewports: ["desktop"],
        aiMode: "off",
      },
      { pool, storage, chromiumExecutablePath: process.env.UI_SCAN_CHROMIUM_PATH }
    );

    // The worker re-validates the URL itself (defense in depth, per the
    // Phase 4 security spec — "run URL validation in API and again
    // inside workers before navigation") rather than trusting the API's
    // earlier check.
    expect(result.status).toBe("FAILED");
    const persistedScan = await getScan(pool, workspace.id, scan.id);
    expect(persistedScan?.status).toBe("FAILED");
  }, 30_000);
});
