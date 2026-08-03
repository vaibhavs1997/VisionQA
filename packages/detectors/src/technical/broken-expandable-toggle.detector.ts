import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Reads `context.page.expandableToggleChecks` — the result of actually
 * clicking a capped sample of `aria-expanded` elements (dropdowns,
 * accordions, disclosure widgets) and verifying the attribute flips and
 * (when `aria-controls` points at a real element) the controlled
 * element's visibility follows (see `collectExpandableToggleChecks`).
 *
 * This is a functional bug, not a cosmetic one — either the toggle
 * genuinely doesn't work, or `aria-expanded` is lying to assistive
 * technology about the actual state of the panel it describes. Both
 * are real defects, which is why this reports at high severity.
 */
export const brokenExpandableToggleDetector: Detector = {
  id: "broken-expandable-toggle-v1",
  version: "1.0.0",
  category: "technical",
  requires: ["dom", "interaction"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const checks = context.page.expandableToggleChecks;
    if (!checks || checks.length === 0) return candidates;

    const elementBySelector = new Map(context.elements.map((el) => [el.selector, el]));

    for (const check of checks) {
      if (check.toggledCorrectly) continue;
      const el = elementBySelector.get(check.selector);
      if (!el) continue;

      candidates.push({
        category: "technical",
        issueType: "broken-expandable-toggle",
        title: "Dropdown/disclosure toggle doesn't work as expected",
        description: check.ariaControlsSelector
          ? `Clicking this ${el.tagName} either didn't flip its aria-expanded state, or aria-expanded changed but the panel it controls (${check.ariaControlsSelector}) didn't actually show/hide to match — assistive technology and sighted users would see two different, contradictory states.`
          : `Clicking this ${el.tagName} didn't flip its aria-expanded attribute — the toggle appears non-functional.`,
        severity: "high",
        confidence: 0.75,
        element: { selector: el.selector, tagName: el.tagName, text: el.visibleText?.slice(0, 80), boundingBox: el.boundingBox ?? undefined },
        evidence: { measuredValue: "aria-expanded did not toggle correctly on click", raw: { ariaControlsSelector: check.ariaControlsSelector } },
        suggestedFix: "Verify the click handler actually toggles aria-expanded and shows/hides the aria-controls target together — they should never be able to disagree.",
        detector: { id: "broken-expandable-toggle-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `broken-expandable-toggle:${el.selector}`,
      });
    }

    return candidates;
  },
};
