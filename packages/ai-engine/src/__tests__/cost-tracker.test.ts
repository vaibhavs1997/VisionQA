import { describe, it, expect } from "vitest";
import { AiCostTracker } from "../cost-tracker";
import { AiCallRecord } from "../types";

function makeCall(overrides: Partial<AiCallRecord> = {}): AiCallRecord {
  return {
    requestKind: "validate",
    issueType: "element-overlap",
    provider: "mock",
    model: "mock-heuristic-v1",
    inputTokens: 100,
    outputTokens: 50,
    estimatedCostUsd: 0.002,
    latencyMs: 10,
    succeeded: true,
    ...overrides,
  };
}

describe("AiCostTracker", () => {
  it("returns zeroed summary with no calls recorded", () => {
    const tracker = new AiCostTracker();
    const summary = tracker.summarize();
    expect(summary.totalCalls).toBe(0);
    expect(summary.totalEstimatedCostUsd).toBe(0);
    expect(summary.costPerConfirmedIssueUsd).toBeUndefined();
  });

  it("aggregates totals across multiple calls", () => {
    const tracker = new AiCostTracker();
    tracker.recordCall(makeCall({ estimatedCostUsd: 0.002, inputTokens: 100, outputTokens: 50, latencyMs: 10 }));
    tracker.recordCall(makeCall({ estimatedCostUsd: 0.003, inputTokens: 120, outputTokens: 60, latencyMs: 20 }));

    const summary = tracker.summarize();
    expect(summary.totalCalls).toBe(2);
    expect(summary.totalEstimatedCostUsd).toBeCloseTo(0.005, 5);
    expect(summary.totalInputTokens).toBe(220);
    expect(summary.totalOutputTokens).toBe(110);
    expect(summary.avgLatencyMs).toBe(15);
  });

  it("counts failed and schema-validation-failed calls separately from succeeded", () => {
    const tracker = new AiCostTracker();
    tracker.recordCall(makeCall({ succeeded: true }));
    tracker.recordCall(makeCall({ succeeded: false }));
    tracker.recordCall(makeCall({ succeeded: true, schemaValidationFailed: true }));

    const summary = tracker.summarize();
    expect(summary.succeededCalls).toBe(2);
    expect(summary.failedCalls).toBe(1);
    expect(summary.schemaValidationFailures).toBe(1);
  });

  it("computes cost per confirmed issue, counting only confirm decisions", () => {
    const tracker = new AiCostTracker();
    tracker.recordCall(makeCall({ estimatedCostUsd: 0.01 }));
    tracker.recordCall(makeCall({ estimatedCostUsd: 0.01 }));
    tracker.recordDecision("element-overlap", "confirm");
    tracker.recordDecision("element-overlap", "suppress");

    const summary = tracker.summarize();
    // total cost 0.02 across 2 calls, but only 1 confirmed decision
    expect(summary.costPerConfirmedIssueUsd).toBeCloseTo(0.02, 5);
  });

  it("breaks down calls and decisions by issue type", () => {
    const tracker = new AiCostTracker();
    tracker.recordCall(makeCall({ issueType: "element-overlap", estimatedCostUsd: 0.01 }));
    tracker.recordCall(makeCall({ issueType: "broken-svg-icon", estimatedCostUsd: 0.005 }));
    tracker.recordDecision("element-overlap", "confirm");
    tracker.recordDecision("broken-svg-icon", "suppress");

    const summary = tracker.summarize();
    expect(summary.byIssueType["element-overlap"].calls).toBe(1);
    expect(summary.byIssueType["element-overlap"].confirmed).toBe(1);
    expect(summary.byIssueType["broken-svg-icon"].suppressed).toBe(1);
  });
});
