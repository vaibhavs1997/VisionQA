import { Pool } from "pg";

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string;
  settings: Record<string, unknown>;
  createdAt: string;
}

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  base_url: string;
  settings: Record<string, unknown>;
  created_at: Date;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    baseUrl: row.base_url,
    settings: row.settings,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createProject(
  pool: Pool,
  input: { workspaceId: string; name: string; baseUrl: string; settings?: Record<string, unknown> }
): Promise<Project> {
  const result = await pool.query<ProjectRow>(
    `INSERT INTO projects (workspace_id, name, base_url, settings) VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.workspaceId, input.name, input.baseUrl, JSON.stringify(input.settings ?? {})]
  );
  return toProject(result.rows[0]);
}

/** Scoped by workspaceId — never trust a bare projectId lookup alone,
 * per the tenant-isolation requirement (a project ID guessed or leaked
 * from another workspace must not be readable). */
export async function getProject(pool: Pool, workspaceId: string, projectId: string): Promise<Project | null> {
  const result = await pool.query<ProjectRow>(`SELECT * FROM projects WHERE id = $1 AND workspace_id = $2`, [
    projectId,
    workspaceId,
  ]);
  return result.rows[0] ? toProject(result.rows[0]) : null;
}

export async function listProjectsForWorkspace(pool: Pool, workspaceId: string): Promise<Project[]> {
  const result = await pool.query<ProjectRow>(
    `SELECT * FROM projects WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );
  return result.rows.map(toProject);
}
