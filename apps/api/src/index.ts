import path from "node:path";
import { Pool } from "pg";
import { loadEnvFile } from "./load-env";
import { runMigrations } from "@ui-quality/database";
import { LocalFilesystemObjectStorage } from "@ui-quality/storage";
import { createLogger, createMetricsRegistry } from "@ui-quality/observability";
import { buildApp } from "./app";

async function main() {
  loadEnvFile();
  const logger = createLogger({ service: "api" });
  const metrics = createMetricsRegistry();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  if ((process.env.AUTH_STORE ?? "postgres") !== "mongo") await runMigrations(pool);

  const storage = new LocalFilesystemObjectStorage({
    rootDir: path.resolve(process.env.STORAGE_ROOT_DIR ?? "./storage-data"),
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? "4000"}/evidence`,
    signingSecret: process.env.STORAGE_SIGNING_SECRET,
  });

  const port = Number.parseInt(process.env.PORT ?? "4000", 10);
  const corsOrigin = process.env.WEB_ORIGIN;

  const app = await buildApp({
    pool,
    storage,
    corsOrigins: corsOrigin ? [corsOrigin] : undefined,
    logger,
    metrics,
  });

  await app.listen({ port, host: "0.0.0.0" });
  logger.info({ port }, "api listening");

  const { runScheduleTick } = await import("./services/schedule-runner.js");
  setInterval(() => {
    runScheduleTick(pool).catch((err: unknown) => logger.error({ err }, "schedule tick failed"));
  }, 60_000);
}

main().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
