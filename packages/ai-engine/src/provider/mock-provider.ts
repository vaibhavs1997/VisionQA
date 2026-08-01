import { AiProvider, AiValidationRequest, AiCallRecord } from "../types";

export interface MockProviderOptions {
  /** Simulated latency, so cost/latency telemetry has realistic-looking numbers in dry runs. */
  simulatedLatencyMs?: number;
}

/**
 * A deterministic, offline AI provider. Makes no network calls and needs
 * no API key — it exists so the full Phase 2 pipeline (candidate
 * selection, crop capture, request building, response validation, issue
 * enhancement, cost telemetry) can be exercised and tested end-to-end
 * without real model access, and so a person without an API key can
 * still see what the AI-assisted flow does end-to-end via `--ai-provider
 * mock`.
 *
 * Its "judgment" is a simple, transparent heuristic on the deterministic
 * evidence already computed — it does NOT look at the actual screenshot
 * (it has no vision). This is explicitly a stand-in for exercising the
 * pipeline, never a substitute for the real validation a vision model
 * provides — every response is tagged so this is auditable, not silently
 * presented as if a real model judged it.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-heuristic-v1";
  private readonly latencyMs: number;

  constructor(options: MockProviderOptions = {}) {
    this.latencyMs = options.simulatedLatencyMs ?? 5;
  }

  private decide(request: AiValidationRequest): {
    decision: "confirm" | "suppress" | "needs_more_evidence";
    confidence: number;
    reason: string;
  } {
    const evidence = request.candidateIssue.evidence;
    const measured = evidence.measuredValue ?? "";
    const overlapMatch = measured.match(/overlapRatio=([\d.]+)/);

    if (overlapMatch) {
      const ratio = Number.parseFloat(overlapMatch[1]);
      if (ratio > 0.6) {
        return { decision: "confirm", confidence: 0.85, reason: `high geometric overlap ratio (${ratio})` };
      }
      if (ratio < 0.3) {
        return { decision: "suppress", confidence: 0.7, reason: `low geometric overlap ratio (${ratio}), likely incidental` };
      }
      return { decision: "needs_more_evidence", confidence: 0.5, reason: `borderline overlap ratio (${ratio})` };
    }

    // Default: mirror the detector's own confidence rather than inventing a judgment.
    return {
      decision: request.candidateIssue.confidence >= 0.7 ? "confirm" : "needs_more_evidence",
      confidence: request.candidateIssue.confidence,
      reason: "no specialized heuristic for this issue type; deferring to detector confidence",
    };
  }

  async validate(request: AiValidationRequest): Promise<{ raw: unknown; call: AiCallRecord }> {
    await new Promise((r) => setTimeout(r, this.latencyMs));
    const { decision, confidence, reason } = this.decide(request);
    const raw = {
      decision,
      confidence,
      explanation: `[mock provider] Heuristic judgment based on measured evidence: ${reason}.`,
      suggestedFix: request.candidateIssue.suggestedFix,
      evidenceSummary: `Mock evidence-based decision: ${reason}.`,
    };
    return {
      raw,
      call: {
        requestKind: "validate",
        issueType: request.candidateIssue.issueType,
        provider: this.name,
        model: this.model,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: this.latencyMs,
        succeeded: true,
      },
    };
  }

  async explain(request: AiValidationRequest): Promise<{ raw: unknown; call: AiCallRecord }> {
    await new Promise((r) => setTimeout(r, this.latencyMs));
    const raw = {
      decision: "confirm",
      confidence: request.candidateIssue.confidence,
      explanation: `[mock provider] ${request.candidateIssue.description}`,
      suggestedFix: request.candidateIssue.suggestedFix ?? "Review the flagged element and its evidence.",
      evidenceSummary: `Restating detector evidence for ${request.candidateIssue.issueType}.`,
    };
    return {
      raw,
      call: {
        requestKind: "explain",
        issueType: request.candidateIssue.issueType,
        provider: this.name,
        model: this.model,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: this.latencyMs,
        succeeded: true,
      },
    };
  }
}
