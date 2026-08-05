import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { FastifyInstance } from "fastify";
import { Pool } from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "@ui-quality/database";
import { LocalFilesystemObjectStorage } from "@ui-quality/storage";
import { buildApp } from "../app";
import { resetRateLimits } from "../services/rate-limiter";
import { closeRedisClient } from "@ui-quality/queue";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://uiquality:uiquality_dev@localhost:5432/ui_quality_test";

let pool: Pool;
let app: FastifyInstance;
let storageDir: string;
const enqueueStub = vi.fn(async (payload: { scanId: string }) => `job_${payload.scanId}`);

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });
  await runMigrations(pool, `${__dirname}/../../../../packages/database/migrations`);
});

afterAll(async () => {
  await pool.end();
  await closeRedisClient();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE users, workspaces, workspace_members, projects, scans, scan_pages, issues, usage_events, audit_log CASCADE`
  );
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "api-test-storage-"));
  const storage = new LocalFilesystemObjectStorage({
    rootDir: storageDir,
    publicBaseUrl: "http://localhost:4000/evidence",
    signingSecret: "test-secret",
  });
  app = await buildApp({ pool, storage, enqueueScan: enqueueStub });
  await resetRateLimits();
  enqueueStub.mockClear();
});

afterEach(async () => {
  await app.close();
  fs.rmSync(storageDir, { recursive: true, force: true });
});

async function registerAndLogin(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "correct-horse-battery" },
  });
  return res.json() as { token: string; user: { id: string; email: string } };
}

async function createWorkspace(token: string, name: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    headers: { authorization: `Bearer ${token}` },
    payload: { name },
  });
  return res.json();
}

describe("auth", () => {
  it("registers a new user and returns a usable session token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "a@example.com", password: "correct-horse-battery" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTruthy();

    const meRes = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${body.token}` } });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().email).toBe("a@example.com");
  });

  it("rejects registration with a password under 8 characters", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email: "a@example.com", password: "short" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects duplicate registration with the same email", async () => {
    await app.inject({ method: "POST", url: "/api/auth/register", payload: { email: "dup@example.com", password: "correct-horse-battery" } });
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { email: "dup@example.com", password: "another-password" } });
    expect(res.statusCode).toBe(409);
  });

  it("logs in with correct credentials and rejects wrong ones identically", async () => {
    await registerAndLogin("login@example.com");
    const good = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "login@example.com", password: "correct-horse-battery" } });
    expect(good.statusCode).toBe(200);

    const badPassword = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "login@example.com", password: "wrong" } });
    const badEmail = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "nope@example.com", password: "correct-horse-battery" } });
    expect(badPassword.statusCode).toBe(401);
    expect(badEmail.statusCode).toBe(401);
    expect(badPassword.json()).toEqual(badEmail.json()); // identical error, no user enumeration
  });

  it("rejects requests with no token, and with a garbage token", async () => {
    const noToken = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(noToken.statusCode).toBe(401);
    const badToken = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: "Bearer garbage" } });
    expect(badToken.statusCode).toBe(401);
  });
});

describe("workspaces + tenant isolation", () => {
  it("creates a workspace and the creator can access it", async () => {
    const { token } = await registerAndLogin("owner@example.com");
    const workspace = await createWorkspace(token, "Acme");
    const res = await app.inject({ method: "GET", url: `/api/workspaces/${workspace.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("owner");
  });

  it("blocks a user who isn't a member from reading a workspace's project (404, not 403)", async () => {
    const owner = await registerAndLogin("owner2@example.com");
    const outsider = await registerAndLogin("outsider@example.com");
    const workspace = await createWorkspace(owner.token, "Private Co");

    const projectRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/projects`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: "Site", baseUrl: "https://example.com" },
    });
    const project = projectRes.json();

    const leakAttempt = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspace.id}/projects/${project.id}`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(leakAttempt.statusCode).toBe(404); // not 403 — doesn't confirm the workspace exists
  });

  it("blocks reading a workspace's data with no token at all", async () => {
    const owner = await registerAndLogin("owner3@example.com");
    const workspace = await createWorkspace(owner.token, "WS");
    const res = await app.inject({ method: "GET", url: `/api/workspaces/${workspace.id}/projects` });
    expect(res.statusCode).toBe(401);
  });
});

describe("projects + scans (workspace-scoped)", () => {
  it("full flow: create project, create scan (enqueued via stub), poll status", async () => {
    const { token } = await registerAndLogin("flow@example.com");
    const workspace = await createWorkspace(token, "Flow WS");
    const headers = { authorization: `Bearer ${token}` };

    const projectRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/projects`,
      headers,
      payload: { name: "Site", baseUrl: "https://example.com" },
    });
    expect(projectRes.statusCode).toBe(201);
    const project = projectRes.json();

    const scanRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/scans`,
      headers,
      payload: { projectId: project.id, viewports: ["desktop"] },
    });
    expect(scanRes.statusCode).toBe(202);
    expect(scanRes.json().status).toBe("QUEUED");
    expect(enqueueStub).toHaveBeenCalledTimes(1);
    expect(enqueueStub).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: workspace.id, projectId: project.id, requestedUrl: "https://example.com" })
    );

    const statusRes = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspace.id}/scans/${scanRes.json().scanId}/status`,
      headers,
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().status).toBe("QUEUED");
  });

  it("enforces the daily scan usage limit per workspace", async () => {
    const { token } = await registerAndLogin("quota@example.com");
    const workspace = await createWorkspace(token, "Quota WS");
    const headers = { authorization: `Bearer ${token}` };
    const projectRes = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspace.id}/projects`,
      headers,
      payload: { name: "Site", baseUrl: "https://example.com" },
    });
    const project = projectRes.json();

    let lastStatus = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/api/workspaces/${workspace.id}/scans`,
        headers,
        payload: { projectId: project.id, viewports: ["desktop"] },
      });
      lastStatus = res.statusCode;
      if (lastStatus === 429 && res.json().error === "usage_limit_exceeded") break;
    }
    expect(lastStatus).toBe(429);
  });

  it("a project created in one workspace is invisible from another workspace's project list", async () => {
    const { token } = await registerAndLogin("multi@example.com");
    const wsA = await createWorkspace(token, "WS A");
    const wsB = await createWorkspace(token, "WS B");
    const headers = { authorization: `Bearer ${token}` };

    await app.inject({ method: "POST", url: `/api/workspaces/${wsA.id}/projects`, headers, payload: { name: "A-site", baseUrl: "https://a.test" } });

    const listB = await app.inject({ method: "GET", url: `/api/workspaces/${wsB.id}/projects`, headers });
    expect(listB.json().projects).toHaveLength(0);
  });
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});
