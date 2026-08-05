import { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { getProject, listProjectScanTrends } from "@ui-quality/database";
import { requireAuth, requireWorkspaceMembership } from "../auth/middleware";

export function registerTrendRoutes(app: FastifyInstance, pool: Pool) {
  const guards = [requireAuth(pool), requireWorkspaceMembership(pool)];

  app.get<{ Params: { workspaceId: string; projectId: string } }>(
    "/api/workspaces/:workspaceId/projects/:projectId/trends",
    { preHandler: guards },
    async (request, reply) => {
      const project = await getProject(pool, request.params.workspaceId, request.params.projectId);
      if (!project) return reply.code(404).send({ error: "project_not_found" });
      const trends = await listProjectScanTrends(pool, request.params.workspaceId, project.id);
      return { trends };
    }
  );
}
