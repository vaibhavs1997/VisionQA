import client from "prom-client";

/**
 * One registry per process (API and worker each get their own — they're
 * scraped as separate Prometheus targets in any real deployment, which
 * matches how they'd actually be deployed: separate pods/instances that
 * scale independently).
 */
export function createMetricsRegistry() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry }); // process CPU/memory/event-loop-lag for free

  const scanDurationSeconds = new client.Histogram({
    name: "ui_quality_scan_duration_seconds",
    help: "Wall-clock time to complete a scan job, labeled by outcome",
    labelNames: ["status"] as const,
    buckets: [1, 5, 10, 20, 30, 60, 120, 300],
    registers: [registry],
  });

  const scanJobsTotal = new client.Counter({
    name: "ui_quality_scan_jobs_total",
    help: "Total scan jobs processed, labeled by terminal status",
    labelNames: ["status"] as const,
    registers: [registry],
  });

  const workerFailuresTotal = new client.Counter({
    name: "ui_quality_worker_failures_total",
    help: "Total viewport-level failures inside the worker (browser crash, navigation timeout, etc.)",
    labelNames: ["reason"] as const,
    registers: [registry],
  });

  const aiCallsTotal = new client.Counter({
    name: "ui_quality_ai_calls_total",
    help: "Total AI validation calls made, labeled by provider and decision",
    labelNames: ["provider", "decision"] as const,
    registers: [registry],
  });

  const aiCostUsdTotal = new client.Counter({
    name: "ui_quality_ai_cost_usd_total",
    help: "Cumulative estimated AI cost in USD",
    labelNames: ["provider"] as const,
    registers: [registry],
  });

  const queueDepth = new client.Gauge({
    name: "ui_quality_queue_depth",
    help: "Current number of jobs waiting in the scan queue (set by whichever process polls BullMQ's counts)",
    registers: [registry],
  });

  const httpRequestDurationSeconds = new client.Histogram({
    name: "ui_quality_http_request_duration_seconds",
    help: "API request duration, labeled by route and status code",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });

  return {
    registry,
    scanDurationSeconds,
    scanJobsTotal,
    workerFailuresTotal,
    aiCallsTotal,
    aiCostUsdTotal,
    queueDepth,
    httpRequestDurationSeconds,
  };
}

export type MetricsRegistry = ReturnType<typeof createMetricsRegistry>;
