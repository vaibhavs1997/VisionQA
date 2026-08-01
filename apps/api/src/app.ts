import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Pool } from "pg";
import { LocalFilesystemObjectStorage } from "@ui-quality/storage";
import { ScanJobPayload } from "@ui-quality/queue";
import { createLogger, createMetricsRegistry, MetricsRegistry, Logger } from "@ui-quality/observability";
import { registerAuthRoutes } from "./routes/auth";
import { registerWorkspaceRoutes } from "./routes/workspaces";
import { registerProjectRoutes } from "./routes/projects";
import { registerScanRoutes } from "./routes/scans";
import { registerIssueRoutes } from "./routes/issues";

export interface BuildAppOptions {
  pool: Pool;
  storage: LocalFilesystemObjectStorage;
  corsOrigins?: string[];
  /** Injectable so tests can substitute a stub instead of touching a
   * real queue/Redis — same DI pattern used for the Phase 3 scan job
   * runner, now applied to the queue producer. */
  enqueueScan?: (payload: ScanJobPayload) => Promise<string>;
  logger?: Logger;
  metrics?: MetricsRegistry;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const logger = options.logger ?? createLogger({ service: "api" });
  const metrics = options.metrics ?? createMetricsRegistry();

  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: options.corsOrigins ?? ["http://localhost:3000"],
  });

  // Request-duration tracking for every route — cheap, and it's exactly
  // the metric you reach for first when someone asks "is the API slow."
  app.addHook("onRequest", async (request) => {
    (request as unknown as { _startTime: number })._startTime = Date.now();
  });
  app.addHook("onResponse", async (request, reply) => {
    const startTime = (request as unknown as { _startTime?: number })._startTime;
    const durationSeconds = startTime ? (Date.now() - startTime) / 1000 : 0;
    const route = request.routeOptions?.url ?? request.url;
    metrics.httpRequestDurationSeconds.observe(
      { method: request.method, route, status: String(reply.statusCode) },
      durationSeconds
    );
    logger.info(
      { method: request.method, route, status: reply.statusCode, durationMs: Math.round(durationSeconds * 1000) },
      "request completed"
    );
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  // Evidence is served through a signed-URL-verifying route, not a bare
  // static file mount — per the Phase 4 security spec ("object storage
  // evidence is private and accessible only through authorized links").
  // Swapping to real S3 later removes this route entirely: presigned S3
  // URLs are served directly by AWS, bypassing this API altogether.
  app.get<{ Params: { "*": string }; Querystring: { expires?: string; token?: string } }>(
    "/evidence/*",
    async (request, reply) => {
      const key = request.params["*"];
      const { expires, token } = request.query;
      if (!expires || !token) {
        return reply.code(403).send({ error: "missing_signature" });
      }
      const verification = options.storage.verifySignedAccess(key, Number(expires), token);
      if (!verification.valid) {
        return reply.code(403).send({ error: "invalid_signature", reason: verification.reason });
      }
      const bytes = await options.storage.getObject(key);
      if (!bytes) return reply.code(404).send({ error: "not_found" });
      reply.header("Content-Type", "image/png");
      return reply.send(bytes);
    }
  );

  registerAuthRoutes(app, options.pool);
  registerWorkspaceRoutes(app, options.pool);
  registerProjectRoutes(app, options.pool);
  registerScanRoutes(app, options.pool, options.storage, { enqueue: options.enqueueScan });
  registerIssueRoutes(app, options.pool);

  return app;
}
