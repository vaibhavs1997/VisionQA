import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Pool } from "pg";
import { createScanSchedule, listScanSchedulesForProject } from "@ui-quality/database";
import { requireAuth, requireWorkspaceMembership } from "../auth/middleware";
import { getProject } from "@ui-quality/database";

const createSchema = z.object({
  projectId: z.string().min(1),
  cronExpression: z.string().default("0 9 * * *"),
  viewports: z.array(z.enum(["desktop", "tablet", "mobile"])).default(["desktop", "mobile"]),
  aiMode: z.enum(["off", "mock", "anthropic"]).default("off"),
  crawlMode: z.enum(["single", "sitemap", "bfs"]).default("single"),
  maxPages: z.number().int().min(1).max(100).default(25),
  notifyEmails: z.array(z.string().email()).default([]),
  slackWebhookUrl: z.string().url().optional(),
});

export function registerScheduleRoutes(app: FastifyInstance, pool: Pool) {
  const guards = [requireAuth(pool), requireWorkspaceMembership(pool)];

  app.get<{ Params: { workspaceId: string; projectId: string } }>(
    "/api/workspaces/:workspaceId/projects/:projectId/schedules",
    { preHandler: guards },
    async (request, reply) => {
      const project = await getProject(pool, request.params.workspaceId, request.params.projectId);
      if (!project) return reply.code(404).send({ error: "project_not_found" });
      const schedules = await listScanSchedulesForProject(pool, request.params.workspaceId, project.id);
      return { schedules };
    }
  );

  app.post<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/schedules",
    { preHandler: guards },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      const project = await getProject(pool, request.params.workspaceId, parsed.data.projectId);
      if (!project) return reply.code(404).send({ error: "project_not_found" });
      const schedule = await createScanSchedule(pool, {
        workspaceId: request.params.workspaceId,
        projectId: project.id,
        cronExpression: parsed.data.cronExpression,
        viewports: parsed.data.viewports,
        aiMode: parsed.data.aiMode,
        crawlMode: parsed.data.crawlMode,
        maxPages: parsed.data.maxPages,
        notifyEmails: parsed.data.notifyEmails,
        slackWebhookUrl: parsed.data.slackWebhookUrl,
      });
      return reply.code(201).send({ schedule });
    }
  );
}
