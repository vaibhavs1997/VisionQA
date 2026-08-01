import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Distinct from text-clipping: this flags content that is NOT clipped
 * (overflow is visible, not hidden) but escapes its parent's box because
 * of `white-space: nowrap` on content wider than the container — the
 * classic case of a long unbroken string (a username, a URL, a long SKU)
 * spilling out over neighboring UI instead of wrapping or truncating.
 */
export const textOverflowDetector: Detector = {
  id: "text-overflow-v1",
  version: "1.0.0",
  category: "layout",
  requires: ["dom", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const el of context.elements) {
      if (!el.isVisible || !el.visibleText) continue;

      const { overflowX, whiteSpace } = el.computedStyle;
      const isVisibleOverflow = overflowX !== "hidden" && overflowX !== "auto" && overflowX !== "scroll";
      if (!isVisibleOverflow) continue;
      if (whiteSpace !== "nowrap" && whiteSpace !== "pre") continue;

      const { scrollWidth, clientWidth } = el.layoutMetrics;
      const overflowPx = scrollWidth - clientWidth;
      if (overflowPx <= 4) continue;

      // Only worth flagging if the parent's box itself is meaningfully
      // sized (not a 0-width flex child that legitimately expands) — a
      // sanity floor to avoid noise on intentionally auto-sizing elements.
      if (clientWidth < 20) continue;

      const confidence = overflowPx > 30 ? 0.8 : 0.6;

      candidates.push({
        category: "layout",
        issueType: "text-overflow",
        title: "Unwrapped text overflows its container",
        description:
          "This element has white-space:nowrap content wider than its box, with overflow not hidden — the text is likely spilling visibly over neighboring elements.",
        severity: overflowPx > 60 ? "high" : "medium",
        confidence,
        element: {
          selector: el.selector,
          tagName: el.tagName,
          text: el.visibleText.slice(0, 120),
          boundingBox: el.boundingBox ?? undefined,
        },
        evidence: {
          measuredValue: `scrollWidth=${scrollWidth}`,
          expectedValue: `clientWidth=${clientWidth}`,
        },
        suggestedFix:
          "Allow wrapping (remove white-space:nowrap or add word-break), or add text-overflow:ellipsis with overflow:hidden if truncation is preferred.",
        detector: { id: "text-overflow-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `text-overflow:${el.selector}`,
      });
    }

    return candidates;
  },
};
