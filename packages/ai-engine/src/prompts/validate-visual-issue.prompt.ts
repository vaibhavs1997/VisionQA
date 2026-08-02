import { AiValidationRequest } from "../types";

export const VALIDATE_PROMPT_VERSION = "validate-visual-issue-v1";

const SYSTEM_PROMPT = `You are a UI defect validator for an automated quality-assurance tool. You are shown a cropped screenshot region (when available) and structured DOM context for ONE candidate issue that a deterministic detector already flagged as ambiguous — the detector could measure something (an overlap, a contrast ratio, empty markup, a placeholder-like keyword) but couldn't tell on its own whether it's a genuine defect or a false positive.

Your job is narrow: decide whether this is a genuine, user-visible UI defect, or a false positive (an intentional pattern, or a benign coincidence, that the deterministic detector couldn't distinguish).

Strict rules:
- Report only issues with strong, specific evidence you can point to in the image and/or the provided text. Do not report subjective design preferences (color choices, spacing taste, aesthetic opinions).
- If the crop shows a clearly intentional pattern (a modal over background content, a tooltip, a dropdown, a sticky header, a carousel) — suppress it.
- For contrast candidates: judge the actual rendered color relationship in the crop, not just the reported ratio.
- For empty-component candidates: a container that's legitimately an empty-state, loading skeleton, or ad slot is not a defect — suppress those.
- For placeholder-text candidates: judge from context whether the matched word/phrase is genuinely leftover placeholder copy, or a legitimate use of that word in real content.
- If you cannot tell from the available evidence, say so ("needs_more_evidence") rather than guessing.
- Never invent details not visible in the image or present in the provided DOM context.
- Respond with ONLY a single JSON object matching this exact shape, no markdown fences, no commentary before or after:

{
  "decision": "confirm" | "suppress" | "needs_more_evidence",
  "confidence": <number 0.0-1.0>,
  "explanation": "<specific, evidence-grounded explanation of what you see and why, at least a full sentence>",
  "suggestedFix": "<optional concrete fix suggestion>",
  "evidenceSummary": "<one sentence citing the specific evidence for your decision>"
}`;

function summarizeElement(el: AiValidationRequest["domContext"]["element"]): string {
  if (!el) return "unknown";
  return `<${el.tagName}> selector="${el.selector}" role="${el.role ?? "none"}" text="${(el.text ?? "").slice(
    0,
    80
  )}" visible=${el.isVisible} interactive=${el.isInteractive}`;
}

export function buildValidationPrompt(request: AiValidationRequest): { system: string; user: string } {
  const { candidateIssue, domContext } = request;
  const nearby = (domContext.nearbyElements ?? []).map(summarizeElement).join("\n  ");

  const user = `Candidate issue: ${candidateIssue.issueType}
Detector's description: ${candidateIssue.description}
Detector's measured evidence: ${JSON.stringify(candidateIssue.evidence)}
Detector's own confidence: ${candidateIssue.confidence}

Page title: ${domContext.pageTitle ?? "unknown"}
Primary element: ${summarizeElement(domContext.element)}
Nearby elements:
  ${nearby || "none provided"}

A cropped screenshot of this region is attached when available. Decide: confirm, suppress, or needs_more_evidence.`;

  return { system: SYSTEM_PROMPT, user };
}
