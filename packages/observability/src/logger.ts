import pino from "pino";

export interface LoggerOptions {
  service: string;
  level?: string;
}

/**
 * One logger factory shared across api/scanner-worker so log lines are
 * structured JSON (parseable by any log aggregator) rather than ad-hoc
 * console.log strings — the difference between "grep the logs and hope"
 * and "query scan duration by service across a week of logs."
 *
 * Falls back to console.log-equivalent human-readable output in local
 * dev (LOG_PRETTY=1) since staring at raw JSON lines while developing is
 * needlessly painful; production always gets structured JSON.
 */
export function createLogger(options: LoggerOptions) {
  const pretty = process.env.LOG_PRETTY === "1";
  return pino({
    name: options.service,
    level: options.level ?? process.env.LOG_LEVEL ?? "info",
    transport: pretty ? { target: "pino-pretty", options: { colorize: true } } : undefined,
    base: { service: options.service },
  });
}

export type Logger = ReturnType<typeof createLogger>;
