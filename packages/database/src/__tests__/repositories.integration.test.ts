import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "../migrate";
import { createUser, findUserByEmail } from "../repositories/users.repo";
import { createWorkspaceWithOwner, getMembership, listWorkspacesForUser } from "../repositories/workspaces.repo";
import { createProject, getProject, listProjectsForWorkspace } from "../repositories/projects.repo";
import { createScan, updateScanProgress, completeScan, getScan, createScanPage } from "../repositories/scans.repo";
import { insertIssues, getIssuesForScan, getIssue, setIssueFeedback, summarizeIssues } from "../repositories/issues.repo";
import { recordUsageEvent, sumUsageForWorkspace } from "../repositories/usage.repo";

// These tests require a real, running Postgres instance — they are
// integration tests, not unit tests, and are deliberately NOT mocked.
// Set TEST_DATABASE_URL to point at a scratch database before running.
const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ui_quality_test";

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });
  await runMigrations(pool, `${__dirname}/../../migrations`);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Truncate everything between tests for isolation — cheap since this
  // is a scratch test database, and CASCADE handles the FK graph.
  await pool.query(
    `TRUNCATE users, workspaces, workspace_members, projects, scans, scan_pages, issues, issue_feedback, usage_events, audit_log CASCADE`
  );
});

describe("users + workspaces (real Postgres)", () => {
  it("creates a user and finds them by email, case-insensitively", async () => {
    await createUser(pool, { email: "Test@Example.com", passwordHash: "hash", passwordSalt: "salt" });
    const found = await findUserByEmail(pool, "test@example.com");
    expect(found?.email).toBe("test@example.com");
  });

  it("enforces unique email at the database level", async () => {
    await createUser(pool, { email: "dup@example.com", passwordHash: "h", passwordSalt: "s" });
    await expect(createUser(pool, { email: "dup@example.com", passwordHash: "h2", passwordSalt: "s2" })).rejects.toThrow();
  });

  it("creates a workspace with the creator as owner, atomically", async () => {
    const user = await createUser(pool, { email: "owner@example.com", passwordHash: "h", passwordSalt: "s" });
    const workspace = await createWorkspaceWithOwner(pool, { name: "Acme", ownerId: user.id });

    const membership = await getMembership(pool, workspace.id, user.id);
    expect(membership?.role).toBe("owner");

    const workspaces = await listWorkspacesForUser(pool, user.id);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe("Acme");
  });

  it("returns null membership for a user not in the workspace (tenant isolation)", async () => {
    const owner = await createUser(pool, { email: "a@example.com", passwordHash: "h", passwordSalt: "s" });
    const outsider = await createUser(pool, { email: "b@example.com", passwordHash: "h", passwordSalt: "s" });
    const workspace = await createWorkspaceWithOwner(pool, { name: "Private Co", ownerId: owner.id });

    const membership = await getMembership(pool, workspace.id, outsider.id);
    expect(membership).toBeNull();
  });
});

describe("projects + tenant scoping (real Postgres)", () => {
  it("cannot read a project from a different workspace even with the correct ID", async () => {
    const userA = await createUser(pool, { email: "a@example.com", passwordHash: "h", passwordSalt: "s" });
    const userB = await createUser(pool, { email: "b@example.com", passwordHash: "h", passwordSalt: "s" });
    const workspaceA = await createWorkspaceWithOwner(pool, { name: "WS A", ownerId: userA.id });
    const workspaceB = await createWorkspaceWithOwner(pool, { name: "WS B", ownerId: userB.id });

    const project = await createProject(pool, { workspaceId: workspaceA.id, name: "Site", baseUrl: "https://a.test" });

    // Same project ID, wrong workspace — must return null, not the project.
    const leaked = await getProject(pool, workspaceB.id, project.id);
    expect(leaked).toBeNull();

    const correct = await getProject(pool, workspaceA.id, project.id);
    expect(correct?.name).toBe("Site");
  });

  it("lists only projects belonging to the given workspace", async () => {
    const user = await createUser(pool, { email: "u@example.com", passwordHash: "h", passwordSalt: "s" });
    const ws1 = await createWorkspaceWithOwner(pool, { name: "WS1", ownerId: user.id });
    const ws2 = await createWorkspaceWithOwner(pool, { name: "WS2", ownerId: user.id });
    await createProject(pool, { workspaceId: ws1.id, name: "P1", baseUrl: "https://p1.test" });
    await createProject(pool, { workspaceId: ws2.id, name: "P2", baseUrl: "https://p2.test" });

    const ws1Projects = await listProjectsForWorkspace(pool, ws1.id);
    expect(ws1Projects).toHaveLength(1);
    expect(ws1Projects[0].name).toBe("P1");
  });
});

describe("scans + issues lifecycle (real Postgres)", () => {
  it("runs a full scan lifecycle: create -> progress -> issues -> complete -> read back", async () => {
    const user = await createUser(pool, { email: "u@example.com", passwordHash: "h", passwordSalt: "s" });
    const workspace = await createWorkspaceWithOwner(pool, { name: "WS", ownerId: user.id });
    const project = await createProject(pool, { workspaceId: workspace.id, name: "P", baseUrl: "https://p.test" });

    const scan = await createScan(pool, {
      projectId: project.id,
      workspaceId: workspace.id,
      requestedUrl: "https://p.test",
      viewports: ["desktop"],
      aiMode: "off",
    });
    expect(scan.status).toBe("QUEUED");

    await updateScanProgress(pool, scan.id, { status: "LOADING_PAGE", currentStep: "Loading desktop" });
    const midScan = await getScan(pool, workspace.id, scan.id);
    expect(midScan?.status).toBe("LOADING_PAGE");
    expect(midScan?.startedAt).not.toBeNull();

    const page = await createScanPage(pool, {
      scanId: scan.id,
      url: "https://p.test",
      viewportName: "desktop",
      viewportWidth: 1440,
      viewportHeight: 900,
      loadState: "loaded",
      screenshotStorageKeys: [`scans/${scan.id}/desktop-viewport.png`],
    });

    await insertIssues(pool, [
      {
        issueId: "unused-client-side-id",
        scanId: scan.id,
        scanPageId: page.id,
        category: "image",
        issueType: "broken-image-network-error",
        title: "Broken image",
        description: "d",
        severity: "critical",
        confidence: 1.0,
        url: "https://p.test",
        viewport: { name: "desktop", width: 1440, height: 900 },
        selector: "img.hero",
        evidence: { httpStatus: 404 },
        detector: { id: "broken-image-v1", version: "1.0.0", source: "deterministic" },
        affectedElementCount: 1,
      },
      {
        issueId: "unused-2",
        scanId: scan.id,
        scanPageId: page.id,
        category: "accessibility",
        issueType: "missing-alt-text",
        title: "Missing alt",
        description: "d",
        severity: "medium",
        confidence: 0.9,
        url: "https://p.test",
        viewport: { name: "desktop", width: 1440, height: 900 },
        evidence: {},
        detector: { id: "missing-alt-v1", version: "1.0.0", source: "deterministic" },
        affectedElementCount: 1,
      },
    ]);

    await completeScan(pool, scan.id, { status: "COMPLETED", finalUrl: "https://p.test", score: 72 });

    const finalScan = await getScan(pool, workspace.id, scan.id);
    expect(finalScan?.status).toBe("COMPLETED");
    expect(finalScan?.score).toBe(72);
    expect(finalScan?.completedAt).not.toBeNull();

    const summary = await summarizeIssues(pool, scan.id);
    expect(summary.totalIssues).toBe(2);
    expect(summary.critical).toBe(1);
    expect(summary.medium).toBe(1);

    const criticalOnly = await getIssuesForScan(pool, workspace.id, scan.id, { severity: ["critical"] });
    expect(criticalOnly).toHaveLength(1);
    expect(criticalOnly[0].issueType).toBe("broken-image-network-error");

    const issueDetail = await getIssue(pool, workspace.id, criticalOnly[0].issueId);
    expect(issueDetail?.title).toBe("Broken image");
    expect(issueDetail?.element?.selector).toBe("img.hero");

    const feedbackOk = await setIssueFeedback(pool, workspace.id, criticalOnly[0].issueId, user.id, "false_positive");
    expect(feedbackOk).toBe(true);
    const afterFeedback = await getIssue(pool, workspace.id, criticalOnly[0].issueId);
    expect(afterFeedback?.feedbackStatus).toBe("false_positive");
  });

  it("cannot submit feedback for an issue belonging to another workspace", async () => {
    const userA = await createUser(pool, { email: "a@example.com", passwordHash: "h", passwordSalt: "s" });
    const userB = await createUser(pool, { email: "b@example.com", passwordHash: "h", passwordSalt: "s" });
    const workspaceA = await createWorkspaceWithOwner(pool, { name: "A", ownerId: userA.id });
    const workspaceB = await createWorkspaceWithOwner(pool, { name: "B", ownerId: userB.id });
    const project = await createProject(pool, { workspaceId: workspaceA.id, name: "P", baseUrl: "https://p.test" });
    const scan = await createScan(pool, {
      projectId: project.id,
      workspaceId: workspaceA.id,
      requestedUrl: "https://p.test",
      viewports: ["desktop"],
      aiMode: "off",
    });
    const page = await createScanPage(pool, {
      scanId: scan.id,
      url: "https://p.test",
      viewportName: "desktop",
      viewportWidth: 1440,
      viewportHeight: 900,
      loadState: "loaded",
      screenshotStorageKeys: [],
    });
    await insertIssues(pool, [
      {
        issueId: "x",
        scanId: scan.id,
        scanPageId: page.id,
        category: "image",
        issueType: "broken-image-network-error",
        title: "t",
        description: "d",
        severity: "high",
        confidence: 1,
        url: "https://p.test",
        viewport: { name: "desktop", width: 1440, height: 900 },
        evidence: {},
        detector: { id: "d", version: "1", source: "deterministic" },
        affectedElementCount: 1,
      },
    ]);
    const [issue] = await getIssuesForScan(pool, workspaceA.id, scan.id);

    const result = await setIssueFeedback(pool, workspaceB.id, issue.issueId, userB.id, "valid");
    expect(result).toBe(false);
  });
});

describe("usage events (real Postgres)", () => {
  it("sums usage events for a workspace within a time window", async () => {
    const user = await createUser(pool, { email: "u@example.com", passwordHash: "h", passwordSalt: "s" });
    const workspace = await createWorkspaceWithOwner(pool, { name: "WS", ownerId: user.id });

    await recordUsageEvent(pool, { workspaceId: workspace.id, eventType: "scan.completed", quantity: 1 });
    await recordUsageEvent(pool, { workspaceId: workspace.id, eventType: "scan.completed", quantity: 1 });
    await recordUsageEvent(pool, { workspaceId: workspace.id, eventType: "ai_call", quantity: 5 });

    const scanCount = await sumUsageForWorkspace(pool, workspace.id, "scan.completed", "2020-01-01T00:00:00Z");
    expect(scanCount).toBe(2);
    const aiCount = await sumUsageForWorkspace(pool, workspace.id, "ai_call", "2020-01-01T00:00:00Z");
    expect(aiCount).toBe(5);
  });
});
