import { AiValidationRequest } from "../types";

export const EXPLAIN_PROMPT_VERSION = "explain-issue-v1";

const SYSTEM_PROMPT = `You are writing a plain-language explanation and fix suggestion for a UI defect that has ALREADY been confirmed by deterministic analysis. Your explanation does not affect whether this issue is reported — it only makes the existing finding more understandable to a non-technical reader.

Rules:
- Ground your explanation strictly in the provided evidence — do not invent details.
- Keep the explanation to 1-2 sentences, plain language, no jargon.
- The suggested fix should name a concrete, likely CSS/markup cause when one is evident from the data given.
- Respond with ONLY a single JSON object, no markdown fences, no commentary:

{
  "decision": "confirm",
  "confidence": <the detector's own confidence, unchanged>,
  "explanation": "<plain-language 1-2 sentence explanation>",
  "suggestedFix": "<concrete fix suggestion>",
  "evidenceSummary": "<one sentence summarizing the evidence this is grounded in>"
}`;

export function buildExplainPrompt(request: AiValidationRequest): { system: string; user: string } {
  const { candidateIssue, domContext } = request;

  const user = `Confirmed issue type: ${candidateIssue.issueType}
Category: ${candidateIssue.category}
Severity: ${candidateIssue.severity}
Technical description: ${candidateIssue.description}
Measured evidence: ${JSON.stringify(candidateIssue.evidence)}
Element: ${domContext.element ? `<${domContext.element.tagName}> ${domContext.element.selector}` : "n/a"}
Page: ${domContext.pageTitle ?? "unknown"}

Write the plain-language explanation and suggested fix.`;

  return { system: SYSTEM_PROMPT, user };
}
