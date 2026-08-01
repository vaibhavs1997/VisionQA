import { IssueCandidate, IssueSeverity, ElementSnapshot, Viewport } from "@ui-quality/shared";

export type InstructionMode = "validate" | "explain";
// Note: "discover" mode from the spec (open-ended AI-driven issue
// discovery) is intentionally NOT implemented — see "Do Not Build Yet"
// in the Phase 2 spec: "No open-ended 'find everything wrong' prompt as
// the default workflow." Only validate (confirm/suppress an existing
// deterministic candidate) and explain (friendlier text for an already-
// confirmed issue) are in scope.

export interface AiValidationRequest {
  candidateIssue: IssueCandidate;
  viewport: Viewport;
  screenshot: {
    fullPagePath?: string;
    cropPath?: string;
    annotatedCropPath?: string;
  };
  domContext: {
    element?: ElementSnapshot;
    nearbyElements?: ElementSnapshot[];
    pageTitle?: string;
  };
  instructionMode: InstructionMode;
}

export interface AiValidationResponse {
  decision: "confirm" | "suppress" | "needs_more_evidence";
  confidence: number;
  issueType?: string;
  severityHint?: IssueSeverity;
  explanation: string;
  suggestedFix?: string;
  evidenceSummary: string;
}

export interface AiCallRecord {
  requestKind: InstructionMode;
  issueType: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs: number;
  succeeded: boolean;
  schemaValidationFailed?: boolean;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Sends a validation request (crop + DOM context) and returns the raw
   * parsed JSON response plus token/cost telemetry. Schema validation of
   * the response happens one layer up (AiResponseValidator), not here —
   * a provider's only job is "call the model, return what it said." */
  validate(request: AiValidationRequest): Promise<{ raw: unknown; call: AiCallRecord }>;
  explain(request: AiValidationRequest): Promise<{ raw: unknown; call: AiCallRecord }>;
}
