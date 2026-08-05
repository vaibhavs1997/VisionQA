/**
 * Dev-only: starts a local PostgreSQL on port 5432 when Docker/native Postgres
 * is not installed. Keep this process running while using the API/worker.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pg = new EmbeddedPostgres({
  databaseDir: path.join(root, ".embedded-pg"),
  user: "uiquality",
  password: "uiquality_dev",
  port: 5432,
  persistent: true,
});

async function main() {
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase("uiquality_dev");
  } catch {
    /* already exists */
  }
  console.log("[embedded-postgres] listening on postgres://uiquality:***@localhost:5432/uiquality_dev");
  console.log("[embedded-postgres] Press Ctrl+C to stop.");

  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[embedded-postgres] failed:", err);
  process.exit(1);
});
