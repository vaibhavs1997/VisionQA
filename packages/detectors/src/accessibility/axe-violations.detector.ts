import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

export const axeViolationsDetector: Detector = {
  id: "axe-violations-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    if (context.scan.viewport.name !== "desktop") return [];
    const violations = context.page.axeViolations;
    if (!violations || violations.length === 0) return [];

    return violations.map((v) => ({
      category: "accessibility",
      issueType: "axe-violation",
      title: `axe: ${v.help}`,
      description: v.description,
      severity: v.impact === "critical" || v.impact === "serious" ? "high" : "medium",
      confidence: 0.92,
      element: { selector: v.selector },
      evidence: { raw: { axeId: v.id, helpUrl: v.helpUrl, impact: v.impact } },
      suggestedFix: `See ${v.helpUrl}`,
      detector: { id: "axe-violations-v1", version: "1.0.0", source: "deterministic" },
      rootCauseSignature: `axe:${v.id}:${v.selector}`,
    }));
  },
};
