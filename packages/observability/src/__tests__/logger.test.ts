import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { createLogger } from "../logger";

describe("createLogger", () => {
  it("produces a working pino logger instance", () => {
    const logger = createLogger({ service: "test-service" });
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("includes the service name in every log line", () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = pino({ base: { service: "scanner-worker" } }, stream);
    logger.info({ scanId: "s1" }, "scan started");

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.service).toBe("scanner-worker");
    expect(parsed.scanId).toBe("s1");
    expect(parsed.msg).toBe("scan started");
  });

  it("respects LOG_LEVEL to suppress lower-severity lines", () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });

    const logger = pino({ level: "warn" }, stream);
    logger.info("should be suppressed");
    logger.warn("should appear");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).msg).toBe("should appear");
  });
});
