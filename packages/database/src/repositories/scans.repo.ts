import { Pool } from "pg";

export type ScanStatus =
  | "QUEUED"
  | "INITIALIZING"
  | "LOADING_PAGE"
  | "COLLECTING_DATA"
  | "RUNNING_DETECTORS"
  | "AI_ANALYSIS"
  | "PROCESSING_RESULTS"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED";

export interface Scan {
  id: string;
  projectId: string;
  workspaceId: string;
  requestedUrl: string;
  finalUrl: string | null;
  viewports: string[];
  aiMode: string;
  status: ScanStatus;
  currentStep: string | null;
  failureReason: string | null;
  score: number | null;
  aiTelemetry: Record<string, unknown> | null;
  jobId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface ScanRow {
  id: string;
  project_id: string;
  workspace_id: string;
  requested_url: string;
  final_url: string | null;
  viewports: string[];
  ai_mode: string;
  status: ScanStatus;
  current_step: string | null;
  failure_reason: string | null;
  score: number | null;
  ai_telemetry: Record<string, unknown> | null;
  job_id: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

function toScan(row: ScanRow): Scan {
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    requestedUrl: row.requested_url,
    finalUrl: row.final_url,
    viewports: row.viewports,
    aiMode: row.ai_mode,
    status: row.status,
    currentStep: row.current_step,
    failureReason: row.failure_reason,
    score: row.score,
    aiTelemetry: row.ai_telemetry,
    jobId: row.job_id,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createScan(
  pool: Pool,
  input: { projectId: string; workspaceId: string; requestedUrl: string; viewports: string[]; aiMode: string }
): Promise<Scan> {
  const result = await pool.query<ScanRow>(
    `INSERT INTO scans (project_id, workspace_id, requested_url, viewports, ai_mode, status)
     VALUES ($1, $2, $3, $4, $5, 'QUEUED') RETURNING *`,
    [input.projectId, input.workspaceId, input.requestedUrl, JSON.stringify(input.viewports), input.aiMode]
  );
  return toScan(result.rows[0]);
}

export async function attachJobId(pool: Pool, scanId: string, jobId: string): Promise<void> {
  await pool.query(`UPDATE scans SET job_id = $1 WHERE id = $2`, [jobId, scanId]);
}

export async function updateScanProgress(
  pool: Pool,
  scanId: string,
  update: { status: ScanStatus; currentStep?: string }
): Promise<void> {
  await pool.query(
    `UPDATE scans SET status = $1, current_step = COALESCE($2, current_step),
       started_at = COALESCE(started_at, CASE WHEN $1 != 'QUEUED' THEN now() ELSE NULL END)
     WHERE id = $3`,
    [update.status, update.currentStep ?? null, scanId]
  );
}

export async function completeScan(
  pool: Pool,
  scanId: string,
  update: {
    status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED";
    finalUrl?: string;
    score?: number;
    failureReason?: string;
    aiTelemetry?: Record<string, unknown>;
  }
): Promise<void> {
  await pool.query(
    `UPDATE scans SET status = $1, final_url = $2, score = $3, failure_reason = $4,
       ai_telemetry = $5, completed_at = now() WHERE id = $6`,
    [
      update.status,
      update.finalUrl ?? null,
      update.score ?? null,
      update.failureReason ?? null,
      update.aiTelemetry ? JSON.stringify(update.aiTelemetry) : null,
      scanId,
    ]
  );
}

/** Workspace-scoped — a scan ID alone is never sufficient to read data,
 * per the tenant-isolation requirement. */
export async function getScan(pool: Pool, workspaceId: string, scanId: string): Promise<Scan | null> {
  const result = await pool.query<ScanRow>(`SELECT * FROM scans WHERE id = $1 AND workspace_id = $2`, [
    scanId,
    workspaceId,
  ]);
  return result.rows[0] ? toScan(result.rows[0]) : null;
}

export async function listScansForProject(pool: Pool, workspaceId: string, projectId: string): Promise<Scan[]> {
  const result = await pool.query<ScanRow>(
    `SELECT * FROM scans WHERE project_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
    [projectId, workspaceId]
  );
  return result.rows.map(toScan);
}

export async function countRecentScansForWorkspace(pool: Pool, workspaceId: string, sinceIso: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM scans WHERE workspace_id = $1 AND created_at >= $2`,
    [workspaceId, sinceIso]
  );
  return Number.parseInt(result.rows[0].count, 10);
}

export interface ScanPage {
  id: string;
  scanId: string;
  url: string;
  viewportName: string;
  viewportWidth: number;
  viewportHeight: number;
  loadState: string;
  screenshotStorageKeys: string[];
}

interface ScanPageRow {
  id: string;
  scan_id: string;
  url: string;
  viewport_name: string;
  viewport_width: number;
  viewport_height: number;
  load_state: string;
  screenshot_storage_keys: string[];
}

function toScanPage(row: ScanPageRow): ScanPage {
  return {
    id: row.id,
    scanId: row.scan_id,
    url: row.url,
    viewportName: row.viewport_name,
    viewportWidth: row.viewport_width,
    viewportHeight: row.viewport_height,
    loadState: row.load_state,
    screenshotStorageKeys: row.screenshot_storage_keys,
  };
}

export async function createScanPage(
  pool: Pool,
  input: {
    scanId: string;
    url: string;
    viewportName: string;
    viewportWidth: number;
    viewportHeight: number;
    loadState: string;
    screenshotStorageKeys: string[];
  }
): Promise<ScanPage> {
  const result = await pool.query<ScanPageRow>(
    `INSERT INTO scan_pages (scan_id, url, viewport_name, viewport_width, viewport_height, load_state, screenshot_storage_keys)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      input.scanId,
      input.url,
      input.viewportName,
      input.viewportWidth,
      input.viewportHeight,
      input.loadState,
      JSON.stringify(input.screenshotStorageKeys),
    ]
  );
  return toScanPage(result.rows[0]);
}

export async function getScanPages(pool: Pool, scanId: string): Promise<ScanPage[]> {
  const result = await pool.query<ScanPageRow>(`SELECT * FROM scan_pages WHERE scan_id = $1`, [scanId]);
  return result.rows.map(toScanPage);
}
