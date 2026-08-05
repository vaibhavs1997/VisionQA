import { Pool } from "pg";

export interface ScanSchedule {
  id: string;
  projectId: string;
  workspaceId: string;
  cronExpression: string;
  enabled: boolean;
  viewports: string[];
  aiMode: string;
  crawlMode: string;
  maxPages: number;
  notifyEmails: string[];
  slackWebhookUrl: string | null;
  lastRunAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  project_id: string;
  workspace_id: string;
  cron_expression: string;
  enabled: boolean;
  viewports: string[];
  ai_mode: string;
  crawl_mode: string;
  max_pages: number;
  notify_emails: string[];
  slack_webhook_url: string | null;
  last_run_at: Date | null;
  created_at: Date;
}

function toSchedule(row: Row): ScanSchedule {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    cronExpression: row.cron_expression,
    enabled: row.enabled,
    viewports: row.viewports,
    aiMode: row.ai_mode,
    crawlMode: row.crawl_mode,
    maxPages: row.max_pages,
    notifyEmails: row.notify_emails ?? [],
    slackWebhookUrl: row.slack_webhook_url,
    lastRunAt: row.last_run_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createScanSchedule(
  pool: Pool,
  input: {
    workspaceId: string;
    projectId: string;
    cronExpression?: string;
    viewports?: string[];
    aiMode?: string;
    crawlMode?: string;
    maxPages?: number;
    notifyEmails?: string[];
    slackWebhookUrl?: string;
  }
): Promise<ScanSchedule> {
  const result = await pool.query<Row>(
    `INSERT INTO scan_schedules (workspace_id, project_id, cron_expression, viewports, ai_mode, crawl_mode, max_pages, notify_emails, slack_webhook_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      input.workspaceId,
      input.projectId,
      input.cronExpression ?? "0 9 * * *",
      JSON.stringify(input.viewports ?? ["desktop", "mobile"]),
      input.aiMode ?? "off",
      input.crawlMode ?? "single",
      input.maxPages ?? 25,
      JSON.stringify(input.notifyEmails ?? []),
      input.slackWebhookUrl ?? null,
    ]
  );
  return toSchedule(result.rows[0]);
}

export async function listScanSchedulesForProject(pool: Pool, workspaceId: string, projectId: string): Promise<ScanSchedule[]> {
  const result = await pool.query<Row>(
    `SELECT * FROM scan_schedules WHERE workspace_id = $1 AND project_id = $2 ORDER BY created_at DESC`,
    [workspaceId, projectId]
  );
  return result.rows.map(toSchedule);
}

/** Schedules due to run (simple daily-at-hour match for MVP). */
export async function listDueScanSchedules(pool: Pool): Promise<ScanSchedule[]> {
  const hour = new Date().getUTCHours();
  const result = await pool.query<Row>(
    `SELECT * FROM scan_schedules WHERE enabled = true AND (
       last_run_at IS NULL OR last_run_at < now() - interval '23 hours'
     )`
  );
  return result.rows
    .map(toSchedule)
    .filter((s) => {
      const parts = s.cronExpression.trim().split(/\s+/);
      const cronHour = parts.length >= 2 ? Number.parseInt(parts[1], 10) : hour;
      return Number.isNaN(cronHour) || cronHour === hour;
    });
}

export async function touchScheduleLastRun(pool: Pool, scheduleId: string): Promise<void> {
  await pool.query(`UPDATE scan_schedules SET last_run_at = now() WHERE id = $1`, [scheduleId]);
}
