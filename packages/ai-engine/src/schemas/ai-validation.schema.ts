import { z } from "zod";

/**
 * Strict schema for AiValidationResponse. Deliberately stricter than a
 * bare type-shape check: minimum explanation/evidenceSummary lengths
 * exist specifically to reject "vague" AI output (e.g. a one-word
 * explanation) that would otherwise pass a naive shape check but isn't
 * actually usable evidence — the Phase 2 spec calls this out explicitly
 * ("AI Response Validator: Rejects malformed, vague, low-confidence, or
 * unsupported AI findings").
 */
export const aiValidationResponseSchema = z.object({
  decision: z.enum(["confirm", "suppress", "needs_more_evidence"]),
  confidence: z.number().min(0).max(1),
  issueType: z.string().optional(),
  severityHint: z.enum(["critical", "high", "medium", "low"]).optional(),
  explanation: z.string().min(15, "explanation is too short/vague to be usable evidence"),
  suggestedFix: z.string().optional(),
  evidenceSummary: z.string().min(10, "evidenceSummary is missing or too vague"),
});

export type ValidatedAiResponse = z.infer<typeof aiValidationResponseSchema>;

export interface AiResponseValidationResult {
  valid: boolean;
  response?: ValidatedAiResponse;
  rejectionReason?: string;
}

/**
 * Parses and validates a raw AI response. Handles the common failure
 * modes of asking a model for JSON: fenced code blocks, leading/trailing
 * prose, or genuinely malformed output. Any failure here is a REJECTION,
 * not a best-effort recovery into an accepted decision — an AI claim
 * that fails schema validation must never influence the final report.
 */
export function validateAiResponse(raw: unknown): AiResponseValidationResult {
  let candidate: unknown = raw;

  if (typeof raw === "string") {
    const stripped = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "");
    try {
      candidate = JSON.parse(stripped);
    } catch {
      return { valid: false, rejectionReason: "response was not valid JSON" };
    }
  }

  const result = aiValidationResponseSchema.safeParse(candidate);
  if (!result.success) {
    return {
      valid: false,
      rejectionReason: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }

  // A confirmed decision with confidence below a usable floor is
  // functionally the same as "needs_more_evidence" — reject rather than
  // let a low-confidence "confirm" masquerade as a solid finding.
  if (result.data.decision === "confirm" && result.data.confidence < 0.5) {
    return {
      valid: false,
      rejectionReason: "decision is 'confirm' but confidence is below the usable floor (0.5)",
    };
  }

  return { valid: true, response: result.data };
}
