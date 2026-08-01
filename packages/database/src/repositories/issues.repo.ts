import { Pool } from "pg";

export interface IssueRow {
  issueId: string;
  scanId: string;
  scanPageId: string;
  category: string;
  issueType: string;
  title: string;
  description: string;
  severity: string;
  confidence: number;
  url: string;
  viewport: { name: string; width: number; height: number };
  selector?: string;
  boundingBox?: Record<string, number>;
  evidence: Record<string, unknown>;
  aiExplanation?: string;
  aiValidation?: Record<string, unknown>;
  suggestedFix?: string;
  detector: { id: string; version: string; source: string };
  rootCauseSignature?: string;
  affectedElementCount: number;
  responsiveRecurrence?: Record<string, unknown>;
}

interface PgIssueRow {
  id: string;
  scan_id: string;
  scan_page_id: string;
  category: string;
  issue_type: string;
  title: string;
  description: string;
  severity: string;
  confidence: number;
  url: string;
  viewport: { name: string; width: number; height: number };
  selector: string | null;
  bounding_box: Record<string, number> | null;
  evidence: Record<string, unknown>;
  ai_explanation: string | null;
  ai_validation: Record<string, unknown> | null;
  suggested_fix: string | null;
  detector: { id: string; version: string; source: string };
  root_cause_signature: string | null;
  affected_element_count: number;
  responsive_recurrence: Record<string, unknown> | null;
  feedback_status: string;
  created_at: Date;
}

function fromPgRow(row: PgIssueRow) {
  return {
    issueId: row.id,
    scanId: row.scan_id,
    pageId: row.scan_page_id,
    category: row.category,
    issueType: row.issue_type,
    title: row.title,
    description: row.description,
    severity: row.severity,
    confidence: row.confidence,
    url: row.url,
    viewport: row.viewport,
    element: row.selector ? { selector: row.selector, boundingBox: row.bounding_box ?? undefined } : undefined,
    evidence: row.evidence,
    aiExplanation: row.ai_explanation ?? undefined,
    aiValidation: row.ai_validation ?? undefined,
    suggestedFix: row.suggested_fix ?? undefined,
    detector: row.detector,
    rootCauseSignature: row.root_cause_signature ?? undefined,
    affectedElementCount: row.affected_element_count,
    responsiveRecurrence: row.responsive_recurrence ?? undefined,
    feedbackStatus: row.feedback_status,
    createdAt: row.created_at.toISOString(),
  };
}

export async function insertIssues(pool: Pool, issues: IssueRow[]): Promise<void> {
  if (issues.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const issue of issues) {
      await client.query(
        `INSERT INTO issues (
          scan_id, scan_page_id, category, issue_type, title, description, severity, confidence,
          url, viewport, selector, bounding_box, evidence, ai_explanation, ai_validation, suggested_fix,
          detector, root_cause_signature, affected_element_count, responsive_recurrence
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          issue.scanId,
          issue.scanPageId,
          issue.category,
          issue.issueType,
          issue.title,
          issue.description,
          issue.severity,
          issue.confidence,
          issue.url,
          JSON.stringify(issue.viewport),
          issue.selector ?? null,
          issue.boundingBox ? JSON.stringify(issue.boundingBox) : null,
          JSON.stringify(issue.evidence),
          issue.aiExplanation ?? null,
          issue.aiValidation ? JSON.stringify(issue.aiValidation) : null,
          issue.suggestedFix ?? null,
          JSON.stringify(issue.detector),
          issue.rootCauseSignature ?? null,
          issue.affectedElementCount,
          issue.responsiveRecurrence ? JSON.stringify(issue.responsiveRecurrence) : null,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function summarizeIssues(pool: Pool, scanId: string) {
  const result = await pool.query<{ severity: string; count: string }>(
    `SELECT severity, COUNT(*) as count FROM issues WHERE scan_id = $1 GROUP BY severity`,
    [scanId]
  );
  const summary = { totalIssues: 0, critical: 0, high: 0, medium: 0, low: 0 };
  for (const row of result.rows) {
    const count = Number.parseInt(row.count, 10);
    summary.totalIssues += count;
    if (row.severity in summary) (summary as any)[row.severity] = count;
  }
  return summary;
}

export interface IssueFilters {
  severity?: string[];
  category?: string[];
  viewport?: string;
}

/** Workspace-scoped via a join through scans — a bare scanId is never
 * trusted alone. */
export async function getIssuesForScan(pool: Pool, workspaceId: string, scanId: string, filters: IssueFilters = {}) {
  const conditions = ["i.scan_id = $1", "s.workspace_id = $2"];
  const params: unknown[] = [scanId, workspaceId];
  let paramIdx = 3;

  if (filters.severity?.length) {
    conditions.push(`i.severity = ANY($${paramIdx++})`);
    params.push(filters.severity);
  }
  if (filters.category?.length) {
    conditions.push(`i.category = ANY($${paramIdx++})`);
    params.push(filters.category);
  }
  if (filters.viewport) {
    conditions.push(`i.viewport->>'name' = $${paramIdx++}`);
    params.push(filters.viewport);
  }

  const result = await pool.query<PgIssueRow>(
    `SELECT i.* FROM issues i JOIN scans s ON s.id = i.scan_id WHERE ${conditions.join(" AND ")} ORDER BY i.created_at`,
    params
  );
  return result.rows.map(fromPgRow);
}

export async function getIssue(pool: Pool, workspaceId: string, issueId: string) {
  const result = await pool.query<PgIssueRow>(
    `SELECT i.* FROM issues i JOIN scans s ON s.id = i.scan_id WHERE i.id = $1 AND s.workspace_id = $2`,
    [issueId, workspaceId]
  );
  return result.rows[0] ? fromPgRow(result.rows[0]) : null;
}

export async function getRelatedIssues(
  pool: Pool,
  workspaceId: string,
  issue: { scanId: string; issueId: string; category: string }
) {
  const result = await pool.query<PgIssueRow>(
    `SELECT i.* FROM issues i JOIN scans s ON s.id = i.scan_id
     WHERE i.scan_id = $1 AND s.workspace_id = $2 AND i.category = $3 AND i.id != $4
     LIMIT 5`,
    [issue.scanId, workspaceId, issue.category, issue.issueId]
  );
  return result.rows.map(fromPgRow);
}

export async function setIssueFeedback(
  pool: Pool,
  workspaceId: string,
  issueId: string,
  userId: string | null,
  feedback: "valid" | "false_positive" | "ignored"
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updateResult = await client.query(
      `UPDATE issues i SET feedback_status = $1
       FROM scans s WHERE s.id = i.scan_id AND i.id = $2 AND s.workspace_id = $3`,
      [feedback, issueId, workspaceId]
    );
    if ((updateResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(`INSERT INTO issue_feedback (issue_id, user_id, feedback) VALUES ($1, $2, $3)`, [
      issueId,
      userId,
      feedback,
    ]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
