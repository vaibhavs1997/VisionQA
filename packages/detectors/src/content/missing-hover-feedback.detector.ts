import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Reads `context.page.hoverFeedbackChecks` — the result of actually
 * hovering a capped sample of links/buttons and diffing computed style
 * against each element's own resting baseline (see
 * `collectHoverFeedbackChecks`). Same shape as the other interaction-
 * based detectors: the real interaction already happened at collection
 * time, so this stays a plain synchronous function.
 *
 * Lower stakes than a missing focus indicator — a sighted mouse user
 * can usually still tell a link/button is clickable from its baseline
 * styling (underline, button chrome) even with zero hover change, so
 * this reports as a lower-severity polish issue rather than a hard
 * accessibility failure.
 */
export const missingHoverFeedbackDetector: Detector = {
  id: "missing-hover-feedback-v1",
  version: "1.0.0",
  category: "content",
  requires: ["dom", "interaction"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const checks = context.page.hoverFeedbackChecks;
    if (!checks || checks.length === 0) return candidates;

    const elementBySelector = new Map(context.elements.map((el) => [el.selector, el]));

    for (const check of checks) {
      if (check.hasVisibleHoverFeedback) continue;
      const el = elementBySelector.get(check.selector);
      if (!el) continue;

      candidates.push({
        category: "content",
        issueType: "missing-hover-feedback",
        title: "No visible hover feedback",
        description: `Hovering this ${el.tagName} produces no detectable visual change (background, text color, border, shadow, or cursor) — mouse users get no confirmation this is interactive until they actually click.`,
        severity: "low",
        confidence: 0.6,
        element: { selector: el.selector, tagName: el.tagName, text: el.visibleText?.slice(0, 80), boundingBox: el.boundingBox ?? undefined },
        evidence: { measuredValue: "no style change on hover" },
        suggestedFix: "Add a hover style — even a subtle background or text-color shift is usually enough to confirm interactivity.",
        detector: { id: "missing-hover-feedback-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `missing-hover-feedback:${el.selector}`,
      });
    }

    return candidates;
  },
};
