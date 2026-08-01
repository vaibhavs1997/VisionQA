import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { getPool } from "./client";

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

export async function runMigrations(poolInstance?: Pool, migrationsDir?: string): Promise<string[]> {
  const pool = poolInstance ?? getPool();
  const dir = migrationsDir ?? path.join(__dirname, "..", "migrations");

  await pool.query(MIGRATIONS_TABLE);

  const applied = new Set(
    (await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
  );

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // filenames are numerically prefixed (001_, 002_, ...) so lexicographic sort is correct order

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    newlyApplied.push(file);
  }

  return newlyApplied;
}

if (require.main === module) {
  runMigrations()
    .then((applied) => {
      // eslint-disable-next-line no-console
      console.log(applied.length > 0 ? `Applied migrations: ${applied.join(", ")}` : "No new migrations to apply.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
