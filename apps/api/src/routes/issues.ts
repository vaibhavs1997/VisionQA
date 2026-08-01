import { FastifyInstance } from "fastify";
import { z } from "zod";
import { Pool } from "pg";
import { getIssue, getRelatedIssues, setIssueFeedback, recordAuditEvent } from "@ui-quality/database";
import { requireAuth, requireWorkspaceMembership } from "../auth/middleware";

const feedbackSchema = z.object({
  feedback: z.enum(["valid", "false_positive", "ignored"]),
});

export function registerIssueRoutes(app: FastifyInstance, pool: Pool) {
  const guards = [requireAuth(pool), requireWorkspaceMembership(pool)];

  app.get<{ Params: { workspaceId: string; issueId: string } }>(
    "/api/workspaces/:workspaceId/issues/:issueId",
    { preHandler: guards },
    async (request, reply) => {
      const issue = await getIssue(pool, request.params.workspaceId, request.params.issueId);
      if (!issue) return reply.code(404).send({ error: "not_found" });
      const relatedIssues = await getRelatedIssues(pool, request.params.workspaceId, {
        scanId: issue.scanId,
        issueId: issue.issueId,
        category: issue.category,
      });
      return { issue, evidence: issue.evidence, relatedIssues };
    }
  );

  app.post<{ Params: { workspaceId: string; issueId: string } }>(
    "/api/workspaces/:workspaceId/issues/:issueId/feedback",
    { preHandler: guards },
    async (request, reply) => {
      const parsed = feedbackSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

      const updated = await setIssueFeedback(
        pool,
        request.params.workspaceId,
        request.params.issueId,
        request.user!.id,
        parsed.data.feedback
      );
      if (!updated) return reply.code(404).send({ error: "not_found" });

      recordAuditEvent(pool, {
        action: "issue.feedback",
        workspaceId: request.params.workspaceId,
        issueId: request.params.issueId,
        userId: request.user!.id,
        ip: request.ip,
        detail: parsed.data.feedback,
      });

      return { ok: true };
    }
  );
}
