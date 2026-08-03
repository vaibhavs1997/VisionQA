import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Reads `context.page.focusIndicatorChecks` — the result of actually
 * focusing a capped sample of interactive elements and diffing their
 * computed style against their own unfocused baseline (see
 * `collectFocusIndicatorChecks` in
 * `packages/scanner-core/src/collector/page-context-collector.ts`).
 * Same shape as `broken-link-v1`: the real interaction already happened
 * at collection time, so this stays a plain synchronous function.
 *
 * A missing focus indicator is one of the highest-impact keyboard-
 * accessibility failures there is — a keyboard-only user genuinely
 * cannot tell where they are on the page, not just "it's a bit harder
 * to tell." That's why this reports at critical severity by default.
 */
export const missingFocusIndicatorDetector: Detector = {
  id: "missing-focus-indicator-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom", "interaction"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const checks = context.page.focusIndicatorChecks;
    if (!checks || checks.length === 0) return candidates;

    const elementBySelector = new Map(context.elements.map((el) => [el.selector, el]));

    for (const check of checks) {
      if (check.hasVisibleFocusIndicator) continue;
      const el = elementBySelector.get(check.selector);
      if (!el) continue;

      candidates.push({
        category: "accessibility",
        issueType: "missing-focus-indicator",
        title: "No visible focus indicator on keyboard focus",
        description: `Focusing this ${el.tagName} produces no detectable visual change (no outline, box-shadow, or border-color change) — a keyboard-only user tabbing through the page has no way to tell this element is focused.`,
        severity: "critical",
        confidence: 0.85,
        element: { selector: el.selector, tagName: el.tagName, text: el.visibleText?.slice(0, 80), boundingBox: el.boundingBox ?? undefined },
        evidence: { measuredValue: "no outline/box-shadow/border change on focus" },
        suggestedFix: "Add a visible :focus-visible style (an outline or box-shadow is usually simplest) — never remove the default outline without replacing it with something equally visible.",
        detector: { id: "missing-focus-indicator-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `missing-focus-indicator:${el.selector}`,
      });
    }

    return candidates;
  },
};
