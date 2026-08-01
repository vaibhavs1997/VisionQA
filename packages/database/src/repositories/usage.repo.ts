import { Pool } from "pg";

export async function recordUsageEvent(
  pool: Pool,
  input: { workspaceId: string; eventType: string; quantity?: number; metadata?: Record<string, unknown> }
): Promise<void> {
  await pool.query(
    `INSERT INTO usage_events (workspace_id, event_type, quantity, metadata) VALUES ($1, $2, $3, $4)`,
    [input.workspaceId, input.eventType, input.quantity ?? 1, JSON.stringify(input.metadata ?? {})]
  );
}

export async function sumUsageForWorkspace(
  pool: Pool,
  workspaceId: string,
  eventType: string,
  sinceIso: string
): Promise<number> {
  const result = await pool.query<{ total: string | null }>(
    `SELECT SUM(quantity) as total FROM usage_events WHERE workspace_id = $1 AND event_type = $2 AND created_at >= $3`,
    [workspaceId, eventType, sinceIso]
  );
  return Number.parseInt(result.rows[0]?.total ?? "0", 10);
}
