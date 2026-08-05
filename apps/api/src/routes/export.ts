import { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { getIssuesForScan, getScan } from "@ui-quality/database";
import { requireAuth, requireWorkspaceMembership } from "../auth/middleware";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "issueId,title,severity,category,issueType,url\n";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return lines.join("\n");
}

export function registerExportRoutes(app: FastifyInstance, pool: Pool) {
  const guards = [requireAuth(pool), requireWorkspaceMembership(pool)];

  app.get<{ Params: { workspaceId: string; scanId: string } }>(
    "/api/workspaces/:workspaceId/scans/:scanId/export.csv",
    { preHandler: guards },
    async (request, reply) => {
      const scan = await getScan(pool, request.params.workspaceId, request.params.scanId);
      if (!scan) return reply.code(404).send({ error: "not_found" });
      const issues = await getIssuesForScan(pool, request.params.workspaceId, scan.id);
      const rows = issues.map((i) => ({
        issueId: i.issueId,
        title: i.title,
        severity: i.severity,
        category: i.category,
        issueType: i.issueType,
        url: i.url,
        viewport: i.viewport.name,
        selector: i.element?.selector ?? "",
      }));
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="scan-${scan.id}.csv"`);
      return toCsv(rows);
    }
  );
}
