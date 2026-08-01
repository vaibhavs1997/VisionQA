import { AiCallRecord } from "./types";

export interface AiTelemetrySummary {
  totalCalls: number;
  succeededCalls: number;
  failedCalls: number;
  schemaValidationFailures: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  avgLatencyMs: number;
  /** Per Phase 2 acceptance criteria: "Track cost per confirmed issue,
   * not just cost per scan." Populated by the caller once decisions are
   * known — the tracker itself only knows about calls, not outcomes. */
  costPerConfirmedIssueUsd?: number;
  byIssueType: Record<
    string,
    { calls: number; estimatedCostUsd: number; confirmed: number; suppressed: number; needsMoreEvidence: number }
  >;
}

/**
 * Accumulates AiCallRecords (and their eventual decisions) across a
 * scan. One instance per scan — the CLI creates it, passes it into the
 * AiService, and reads the summary back out when writing the report.
 */
export class AiCostTracker {
  private calls: AiCallRecord[] = [];
  private decisions: Array<{ issueType: string; decision: "confirm" | "suppress" | "needs_more_evidence" }> = [];

  recordCall(call: AiCallRecord): void {
    this.calls.push(call);
  }

  recordDecision(issueType: string, decision: "confirm" | "suppress" | "needs_more_evidence"): void {
    this.decisions.push({ issueType, decision });
  }

  summarize(): AiTelemetrySummary {
    const byIssueType: AiTelemetrySummary["byIssueType"] = {};

    for (const call of this.calls) {
      const bucket = (byIssueType[call.issueType] ??= {
        calls: 0,
        estimatedCostUsd: 0,
        confirmed: 0,
        suppressed: 0,
        needsMoreEvidence: 0,
      });
      bucket.calls++;
      bucket.estimatedCostUsd += call.estimatedCostUsd ?? 0;
    }

    let confirmedCount = 0;
    for (const { issueType, decision } of this.decisions) {
      const bucket = (byIssueType[issueType] ??= {
        calls: 0,
        estimatedCostUsd: 0,
        confirmed: 0,
        suppressed: 0,
        needsMoreEvidence: 0,
      });
      if (decision === "confirm") {
        bucket.confirmed++;
        confirmedCount++;
      } else if (decision === "suppress") bucket.suppressed++;
      else bucket.needsMoreEvidence++;
    }

    const totalEstimatedCostUsd = this.calls.reduce((sum, c) => sum + (c.estimatedCostUsd ?? 0), 0);
    const totalLatency = this.calls.reduce((sum, c) => sum + c.latencyMs, 0);

    return {
      totalCalls: this.calls.length,
      succeededCalls: this.calls.filter((c) => c.succeeded).length,
      failedCalls: this.calls.filter((c) => !c.succeeded).length,
      schemaValidationFailures: this.calls.filter((c) => c.schemaValidationFailed).length,
      totalInputTokens: this.calls.reduce((sum, c) => sum + (c.inputTokens ?? 0), 0),
      totalOutputTokens: this.calls.reduce((sum, c) => sum + (c.outputTokens ?? 0), 0),
      totalEstimatedCostUsd,
      avgLatencyMs: this.calls.length > 0 ? totalLatency / this.calls.length : 0,
      costPerConfirmedIssueUsd: confirmedCount > 0 ? totalEstimatedCostUsd / confirmedCount : undefined,
      byIssueType,
    };
  }
}
