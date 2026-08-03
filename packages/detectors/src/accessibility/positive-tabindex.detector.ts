import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Flags explicit positive `tabindex` values (tabindex="1", "2", etc.) —
 * the single most well-documented cause of illogical keyboard tab
 * order. A positive tabindex pulls that element out of natural DOM
 * order and into a separate numbered sequence that the browser visits
 * *before* any tabindex="0"/default element, regardless of where it
 * sits visually — so a page with even one positive tabindex often ends
 * up with a tab order that jumps around unpredictably relative to what
 * a sighted user sees.
 *
 * This is a purely static check (positive tabindex is always wrong
 * regardless of layout), unlike `missing-focus-indicator-v1` which
 * needs real interaction — the two together are what close out the
 * "tab order" and "focus indicators" checklist items.
 */
export const positiveTabindexDetector: Detector = {
  id: "positive-tabindex-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const el of context.elements) {
      const raw = el.attributes.tabindex;
      if (raw === undefined) continue;
      const value = Number.parseInt(raw, 10);
      if (Number.isNaN(value) || value <= 0) continue;

      candidates.push({
        category: "accessibility",
        issueType: "positive-tabindex",
        title: `tabindex="${value}" disrupts natural tab order`,
        description: `A positive tabindex takes this element out of the page's natural reading order and into a separate numbered sequence, visited before any tabindex="0"/default element — this is the most common cause of a keyboard tab order that doesn't match what a sighted user sees on screen.`,
        severity: "medium",
        confidence: 0.85,
        element: { selector: el.selector, tagName: el.tagName, text: el.visibleText?.slice(0, 80), boundingBox: el.boundingBox ?? undefined },
        evidence: { measuredValue: `tabindex="${value}"`, expectedValue: 'tabindex="0" or no tabindex attribute' },
        suggestedFix: 'Remove the positive tabindex. Use tabindex="0" (to make a non-interactive element focusable in its natural position) or reorder the DOM/CSS instead of forcing a specific tab position.',
        detector: { id: "positive-tabindex-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `positive-tabindex:${el.selector}`,
      });
    }

    return candidates;
  },
};
