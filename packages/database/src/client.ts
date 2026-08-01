import { Pool, PoolClient } from "pg";

let pool: Pool | null = null;

export interface DbConfig {
  connectionString?: string;
  max?: number;
}

/**
 * Returns a shared connection pool. Reuses the same singleton pattern as
 * the Phase 3 SQLite client (getDb) so callers (API, worker) don't each
 * need to know pool-sizing details — one config point, here.
 */
export function getPool(config: DbConfig = {}): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: config.connectionString ?? process.env.DATABASE_URL,
    max: config.max ?? 10,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Runs `fn` inside a single client checked out from the pool, for
 * callers that need multiple statements against the same connection
 * (transactions) rather than the pool's default per-query connection. */
export async function withClient<T>(poolInstance: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await poolInstance.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Runs `fn` inside a transaction (BEGIN/COMMIT/ROLLBACK) on a single
 * checked-out client. */
export async function withTransaction<T>(poolInstance: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(poolInstance, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}
