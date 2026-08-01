import { AiValidationRequest } from "../types";

export const VALIDATE_PROMPT_VERSION = "validate-visual-issue-v1";

const SYSTEM_PROMPT = `You are a UI defect validator for an automated quality-assurance tool. You are shown a cropped screenshot region and structured DOM context for ONE candidate issue that a deterministic detector already flagged as geometrically ambiguous.

Your job is narrow: decide whether this is a genuine, visually-harmful UI defect, or a false positive (an intentional design pattern the deterministic detector couldn't distinguish).

Strict rules:
- Report only issues with strong, specific visual evidence you can point to in the image. Do not report subjective design preferences (color choices, spacing taste, aesthetic opinions).
- If the crop shows a clearly intentional pattern (a modal over background content, a tooltip, a dropdown, a sticky header, a carousel) — suppress it.
- If you cannot tell from the crop and context alone, say so ("needs_more_evidence") rather than guessing.
- Never invent details not visible in the image or present in the provided DOM context.
- Respond with ONLY a single JSON object matching this exact shape, no markdown fences, no commentary before or after:

{
  "decision": "confirm" | "suppress" | "needs_more_evidence",
  "confidence": <number 0.0-1.0>,
  "explanation": "<specific, evidence-grounded explanation of what you see and why, at least a full sentence>",
  "suggestedFix": "<optional concrete fix suggestion>",
  "evidenceSummary": "<one sentence citing the specific visual evidence for your decision>"
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

A cropped screenshot of this region is attached. Decide: confirm, suppress, or needs_more_evidence.`;

  return { system: SYSTEM_PROMPT, user };
}
