import { Pool } from "pg";

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
}

export type WorkspaceRole = "owner" | "admin" | "member";

interface WorkspaceRow {
  id: string;
  name: string;
  plan: string;
  created_at: Date;
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, plan: row.plan, createdAt: row.created_at.toISOString() };
}

export async function createWorkspaceWithOwner(
  pool: Pool,
  input: { name: string; ownerId: string }
): Promise<Workspace> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const wsResult = await client.query<WorkspaceRow>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING *`,
      [input.name]
    );
    const workspace = wsResult.rows[0];
    await client.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      workspace.id,
      input.ownerId,
    ]);
    await client.query("COMMIT");
    return toWorkspace(workspace);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The core tenant-isolation check: does this user belong to this
 * workspace at all, and if so with what role? Every workspace-scoped API
 * route must call this before touching any project/scan/issue data —
 * this is the single seam that turns Phase 3's implicit single-tenant
 * trust into Phase 4's explicit per-request tenant boundary.
 */
export async function getMembership(
  pool: Pool,
  workspaceId: string,
  userId: string
): Promise<{ role: WorkspaceRole } | null> {
  const result = await pool.query<{ role: WorkspaceRole }>(
    `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
  return result.rows[0] ?? null;
}

export async function listWorkspacesForUser(pool: Pool, userId: string): Promise<Workspace[]> {
  const result = await pool.query<WorkspaceRow>(
    `SELECT w.* FROM workspaces w
     JOIN workspace_members m ON m.workspace_id = w.id
     WHERE m.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId]
  );
  return result.rows.map(toWorkspace);
}

export async function getWorkspace(pool: Pool, id: string): Promise<Workspace | null> {
  const result = await pool.query<WorkspaceRow>(`SELECT * FROM workspaces WHERE id = $1`, [id]);
  return result.rows[0] ? toWorkspace(result.rows[0]) : null;
}
