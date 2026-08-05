import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Pool } from "pg";
import {
  getProject,
  createScan,
  attachJobId,
  completeScan,
  getScan,
  getScanPages,
  listScansForProject,
  countRecentScansForWorkspace,
  summarizeIssues,
  getIssuesForScan,
} from "@ui-quality/database";
import { enqueueScan, cancelQueuedScanJob, ScanJobPayload } from "@ui-quality/queue";
import { requireAuth, requireWorkspaceMembership } from "../auth/middleware";
import { recordAuditEvent } from "@ui-quality/database";
import { checkRateLimit } from "../services/rate-limiter";

const createScanSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().url().optional(),
  viewports: z.array(z.enum(["desktop", "tablet", "mobile"])).min(1).default(["desktop", "mobile"]),
  crawlMode: z.enum(["single", "sitemap", "bfs"]).default("single"),
  maxPages: z.number().int().min(1).max(100).optional(),
  options: z.object({ ai: z.enum(["off", "mock", "anthropic"]).default("off") }).default({ ai: "off" }),
});

const issueFiltersSchema = z.object({
  severity: z.string().optional(),
  category: z.string().optional(),
  viewport: z.string().optional(),
});

// Per the Phase 4 usage-limits spec: enforce a per-workspace scan quota.
// Deliberately generous (this is not a real pricing model, just a real,
// working enforcement point) — tune per actual plan tiers later.
const FREE_PLAN_DAILY_SCAN_LIMIT = 20;

import { ObjectStorage } from "@ui-quality/storage";

export interface ScanRouteOptions {
  /** Injectable so tests can substitute a stub instead of touching a
   * real queue/Redis. Defaults to the real enqueueScan. */
  enqueue?: (payload: ScanJobPayload) => Promise<string>;
}

export function registerScanRoutes(app: FastifyInstance, pool: Pool, storage: ObjectStorage, routeOptions: ScanRouteOptions = {}) {
  const enqueue = routeOptions.enqueue ?? enqueueScan;
  const guards = [requireAuth(pool), requireWorkspaceMembership(pool)];

  app.post<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/scans",
    { preHandler: guards },
    async (request, reply) => {
      const rateLimitResult = await checkRateLimit(request.ip, "create_scan");
      if (!rateLimitResult.allowed) {
        return reply.code(429).send({ error: "rate_limited", retryAfterMs: rateLimitResult.retryAfterMs });
      }

      const parsed = createScanSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }

      const { workspaceId } = request.params;
      const project = await getProject(pool, workspaceId, parsed.data.projectId);
      if (!project) return reply.code(404).send({ error: "project_not_found" });

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentCount = await countRecentScansForWorkspace(pool, workspaceId, since);
      if (recentCount >= FREE_PLAN_DAILY_SCAN_LIMIT) {
        return reply.code(429).send({
          error: "usage_limit_exceeded",
          message: `Daily scan limit (${FREE_PLAN_DAILY_SCAN_LIMIT}) reached for this workspace.`,
        });
      }

      const requestedUrl = parsed.data.url ?? project.baseUrl;
      const crawlMode = parsed.data.crawlMode ?? "single";
      const maxPages = parsed.data.maxPages;
      const scan = await createScan(pool, {
        projectId: project.id,
        workspaceId,
        requestedUrl,
        viewports: parsed.data.viewports,
        aiMode: parsed.data.options.ai,
        crawlMode,
        pagesPlanned: crawlMode === "single" ? 1 : maxPages,
      });

      const jobId = await enqueue({
        scanId: scan.id,
        workspaceId,
        projectId: project.id,
        requestedUrl,
        viewports: parsed.data.viewports,
        aiMode: parsed.data.options.ai,
        crawlMode,
        maxPages,
        projectSettings: project.settings,
      });
      await attachJobId(pool, scan.id, jobId);

      recordAuditEvent(pool, { action: "scan.start", workspaceId, scanId: scan.id, userId: request.user!.id, ip: request.ip });

      return reply.code(202).send({ scanId: scan.id, status: "QUEUED" });
    }
  );

  app.get<{ Params: { workspaceId: string; scanId: string } }>(
    "/api/workspaces/:workspaceId/scans/:scanId/status",
    { preHandler: guards },
    async (request, reply) => {
      const scan = await getScan(pool, request.params.workspaceId, request.params.scanId);
      if (!scan) return reply.code(404).send({ error: "not_found" });
      const summary =
        scan.status === "COMPLETED" || scan.status === "PARTIALLY_COMPLETED"
          ? await summarizeIssues(pool, scan.id)
          : undefined;
      return { status: scan.status, currentStep: scan.currentStep, issueCount: summary?.totalIssues };
    }
  );

  app.post<{ Params: { workspaceId: string; scanId: string } }>(
    "/api/workspaces/:workspaceId/scans/:scanId/cancel",
    { preHandler: guards },
    async (request, reply) => {
      const scan = await getScan(pool, request.params.workspaceId, request.params.scanId);
      if (!scan) return reply.code(404).send({ error: "not_found" });

      const terminal = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"]);
      if (terminal.has(scan.status)) {
        return reply.code(409).send({ error: "scan_not_active", status: scan.status });
      }

      await cancelQueuedScanJob(scan.id);
      await completeScan(pool, scan.id, { status: "FAILED", failureReason: "Cancelled by user" });
      recordAuditEvent(pool, {
        action: "scan.cancel",
        workspaceId: request.params.workspaceId,
        scanId: scan.id,
        userId: request.user!.id,
        ip: request.ip,
      });

      return { scanId: scan.id, status: "FAILED", failureReason: "Cancelled by user" };
    }
  );

  app.get<{ Params: { workspaceId: string; scanId: string } }>(
    "/api/workspaces/:workspaceId/scans/:scanId",
    { preHandler: guards },
    async (request, reply) => {
      const scan = await getScan(pool, request.params.workspaceId, request.params.scanId);
      if (!scan) return reply.code(404).send({ error: "not_found" });
      const pages = await getScanPages(pool, scan.id);
      const pagesWithSignedUrls = await Promise.all(
        pages.map(async (page) => ({
          ...page,
          screenshotUrls: await Promise.all(page.screenshotStorageKeys.map((key) => storage.getSignedUrl(key))),
        }))
      );
      const summary =
        scan.status === "COMPLETED" || scan.status === "PARTIALLY_COMPLETED"
          ? await summarizeIssues(pool, scan.id)
          : { totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0 };
      return { scan, summary, pages: pagesWithSignedUrls };
    }
  );

  app.get<{ Params: { workspaceId: string; scanId: string }; Querystring: Record<string, string> }>(
    "/api/workspaces/:workspaceId/scans/:scanId/issues",
    { preHandler: guards },
    async (request, reply) => {
      const scan = await getScan(pool, request.params.workspaceId, request.params.scanId);
      if (!scan) return reply.code(404).send({ error: "not_found" });

      const parsed = issueFiltersSchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

      const issues = await getIssuesForScan(pool, request.params.workspaceId, scan.id, {
        severity: parsed.data.severity?.split(","),
        category: parsed.data.category?.split(","),
        viewport: parsed.data.viewport,
      });
      return { issues };
    }
  );

  app.get<{ Params: { workspaceId: string; projectId: string } }>(
    "/api/workspaces/:workspaceId/projects/:projectId/scans",
    { preHandler: guards },
    async (request, reply) => {
      const project = await getProject(pool, request.params.workspaceId, request.params.projectId);
      if (!project) return reply.code(404).send({ error: "project_not_found" });
      const scans = await listScansForProject(pool, request.params.workspaceId, project.id);
      return { scans };
    }
  );
}
