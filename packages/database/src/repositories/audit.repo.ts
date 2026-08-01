import { Pool } from "pg";

export interface AuditEvent {
  workspaceId?: string;
  action: string;
  scanId?: string;
  issueId?: string;
  userId?: string;
  ip?: string;
  detail?: string;
}

/** Best-effort — must never throw into a caller's fire-and-forget chain
 * (this exact failure mode was caught and fixed in Phase 3; the lesson
 * carries forward here rather than being re-learned). */
export async function recordAuditEvent(pool: Pool, event: AuditEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (workspace_id, action, scan_id, issue_id, user_id, ip, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.workspaceId ?? null,
        event.action,
        event.scanId ?? null,
        event.issueId ?? null,
        event.userId ?? null,
        event.ip ?? null,
        event.detail ?? null,
      ]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[audit-log] failed to record "${event.action}" event:`, err);
  }
}
