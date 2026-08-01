import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Flags elements whose content overflows their box (scrollHeight/Width >
 * client) while overflow is hidden and NO intentional-truncation styling
 * (text-overflow:ellipsis or -webkit-line-clamp) is present. Those two
 * patterns are the standard, deliberate way to truncate text — their
 * absence alongside hidden overflow is what makes this look like an
 * accidental clip rather than a designed one.
 */
export const textClippingDetector: Detector = {
  id: "text-clipping-v1",
  version: "1.0.0",
  category: "layout",
  requires: ["dom", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const el of context.elements) {
      if (!el.isVisible || !el.visibleText) continue;

      const { overflowX, overflowY, textOverflow, webkitLineClamp } = el.computedStyle;
      const isHidden = overflowX === "hidden" || overflowY === "hidden";
      if (!isHidden) continue;

      const isIntentionalTruncation =
        textOverflow === "ellipsis" || (webkitLineClamp && webkitLineClamp !== "none");
      if (isIntentionalTruncation) continue;

      const { scrollWidth, clientWidth, scrollHeight, clientHeight } = el.layoutMetrics;
      const horizontalClip = scrollWidth > clientWidth + 2;
      const verticalClip = scrollHeight > clientHeight + 2;
      if (!horizontalClip && !verticalClip) continue;

      const clippedPx = Math.max(scrollWidth - clientWidth, scrollHeight - clientHeight);
      const confidence = clippedPx > 10 ? 0.85 : 0.65;

      candidates.push({
        category: "layout",
        issueType: "text-clipping",
        title: "Text content is clipped by its container",
        description:
          "This element's text content overflows its box with overflow:hidden set and no ellipsis or line-clamp styling, so the overflowing text is likely cut off and unreadable.",
        severity: clippedPx > 20 ? "high" : "medium",
        confidence,
        element: {
          selector: el.selector,
          tagName: el.tagName,
          text: el.visibleText.slice(0, 120),
          boundingBox: el.boundingBox ?? undefined,
        },
        evidence: {
          measuredValue: `scroll=${scrollWidth}x${scrollHeight}`,
          expectedValue: `client=${clientWidth}x${clientHeight}`,
        },
        suggestedFix:
          "Add text-overflow: ellipsis (with white-space: nowrap) for single-line truncation, or -webkit-line-clamp for multi-line truncation, or resize the container to fit the content.",
        detector: { id: "text-clipping-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `text-clipping:${el.selector}`,
      });
    }

    return candidates;
  },
};
