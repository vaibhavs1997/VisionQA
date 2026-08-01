import { describe, it, expect } from "vitest";
import { createMetricsRegistry } from "../metrics";

describe("createMetricsRegistry", () => {
  it("records a scan duration observation and it shows up in the exported text", async () => {
    const metrics = createMetricsRegistry();
    metrics.scanDurationSeconds.observe({ status: "COMPLETED" }, 12.5);

    const output = await metrics.registry.metrics();
    expect(output).toContain("ui_quality_scan_duration_seconds");
    expect(output).toContain('status="COMPLETED"');
  });

  it("increments scan job counters independently per status label", async () => {
    const metrics = createMetricsRegistry();
    metrics.scanJobsTotal.inc({ status: "COMPLETED" });
    metrics.scanJobsTotal.inc({ status: "COMPLETED" });
    metrics.scanJobsTotal.inc({ status: "FAILED" });

    const completedValue = await metrics.scanJobsTotal.get();
    const completed = completedValue.values.find((v) => v.labels.status === "COMPLETED");
    const failed = completedValue.values.find((v) => v.labels.status === "FAILED");
    expect(completed?.value).toBe(2);
    expect(failed?.value).toBe(1);
  });

  it("tracks AI cost cumulatively across calls", async () => {
    const metrics = createMetricsRegistry();
    metrics.aiCostUsdTotal.inc({ provider: "anthropic" }, 0.002);
    metrics.aiCostUsdTotal.inc({ provider: "anthropic" }, 0.003);

    const value = await metrics.aiCostUsdTotal.get();
    const anthropicValue = value.values.find((v) => v.labels.provider === "anthropic");
    expect(anthropicValue?.value).toBeCloseTo(0.005, 5);
  });

  it("sets and reads the queue depth gauge", async () => {
    const metrics = createMetricsRegistry();
    metrics.queueDepth.set(7);
    const value = await metrics.queueDepth.get();
    expect(value.values[0].value).toBe(7);
  });

  it("keeps separate registries fully independent", async () => {
    const a = createMetricsRegistry();
    const b = createMetricsRegistry();
    a.scanJobsTotal.inc({ status: "COMPLETED" });

    const bOutput = await b.registry.metrics();
    // b's registry should show the metric defined (zero-valued or absent
    // for that label) but must never reflect a's increment.
    const bValue = await b.scanJobsTotal.get();
    const bCompleted = bValue.values.find((v) => v.labels.status === "COMPLETED");
    expect(bCompleted?.value ?? 0).toBe(0);
  });

  it("includes default process metrics (CPU/memory) alongside custom ones", async () => {
    const metrics = createMetricsRegistry();
    const output = await metrics.registry.metrics();
    expect(output).toContain("process_cpu_user_seconds_total");
  });
});
