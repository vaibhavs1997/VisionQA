import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Pool } from "pg";
import { createWorkspaceWithOwner, listWorkspacesForUser, getWorkspace, getMembership } from "@ui-quality/database";
import { requireAuth, requireWorkspaceMembership } from "../auth/middleware";

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
});

export function registerWorkspaceRoutes(app: FastifyInstance, pool: Pool) {
  app.post("/api/workspaces", { preHandler: requireAuth(pool) }, async (request, reply) => {
    const parsed = createWorkspaceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const workspace = await createWorkspaceWithOwner(pool, { name: parsed.data.name, ownerId: request.user!.id });
    return reply.code(201).send(workspace);
  });

  app.get("/api/workspaces", { preHandler: requireAuth(pool) }, async (request) => {
    const workspaces = await listWorkspacesForUser(pool, request.user!.id);
    return { workspaces };
  });

  app.get<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId",
    { preHandler: [requireAuth(pool), requireWorkspaceMembership(pool)] },
    async (request, reply) => {
      const workspace = await getWorkspace(pool, request.params.workspaceId);
      if (!workspace) return reply.code(404).send({ error: "not_found" });
      const membership = await getMembership(pool, workspace.id, request.user!.id);
      return { ...workspace, role: membership?.role };
    }
  );
}
