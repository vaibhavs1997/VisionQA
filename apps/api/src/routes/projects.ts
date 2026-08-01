import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Pool } from "pg";
import { createProject, getProject, listProjectsForWorkspace } from "@ui-quality/database";
import { requireAuth, requireWorkspaceMembership } from "../auth/middleware";

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  baseUrl: z.string().url(),
});

export function registerProjectRoutes(app: FastifyInstance, pool: Pool) {
  const guards = [requireAuth(pool), requireWorkspaceMembership(pool)];

  app.post<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/projects",
    { preHandler: guards },
    async (request, reply) => {
      const parsed = createProjectSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
      }
      const project = await createProject(pool, {
        workspaceId: request.params.workspaceId,
        name: parsed.data.name,
        baseUrl: parsed.data.baseUrl,
      });
      return reply.code(201).send(project);
    }
  );

  app.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/projects",
    { preHandler: guards },
    async (request) => {
      const projects = await listProjectsForWorkspace(pool, request.params.workspaceId);
      return { projects };
    }
  );

  app.get<{ Params: { workspaceId: string; projectId: string } }>(
    "/api/workspaces/:workspaceId/projects/:projectId",
    { preHandler: guards },
    async (request, reply) => {
      const project = await getProject(pool, request.params.workspaceId, request.params.projectId);
      if (!project) return reply.code(404).send({ error: "not_found" });
      return project;
    }
  );
}
