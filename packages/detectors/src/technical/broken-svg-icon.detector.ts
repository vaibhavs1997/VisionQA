import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Flags <svg> elements that are visible, meaningfully sized, and
 * apparently meant to convey information (have a role/aria-label, or
 * simply aren't marked decorative) but contain no actual visible shape
 * (no path/circle/rect/etc children) — the "icon that silently renders
 * as an empty box" defect. Icon-font-style SVGs (class name containing
 * "icon") get slightly lower confidence since sprite/symbol-reference
 * patterns are harder to evaluate deterministically and are more
 * false-positive-prone.
 */
export const brokenSvgIconDetector: Detector = {
  id: "broken-svg-icon-v1",
  version: "1.0.0",
  category: "technical",
  requires: ["dom", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const MIN_AREA_PX = 16;

    for (const svg of context.svgs) {
      if (!svg.isVisible) continue;
      if (svg.ariaHidden) continue;
      if (svg.hasVisibleShape) continue;

      const area = svg.boundingBox ? svg.boundingBox.width * svg.boundingBox.height : 0;
      if (area < MIN_AREA_PX) continue;

      const isMeaningful = !!svg.role || !!svg.ariaLabel;
      const confidence = svg.isLikelyIconFont ? 0.6 : isMeaningful ? 0.85 : 0.7;

      candidates.push({
        category: "technical",
        issueType: "broken-svg-icon",
        title: "SVG renders no visible shape",
        description:
          "This <svg> element is visible and meaningfully sized but contains no rendered path/shape — it's likely a broken icon reference (e.g. a missing <use> target) rather than an intentionally empty spacer.",
        severity: isMeaningful ? "medium" : "low",
        confidence,
        element: {
          selector: svg.selector,
          tagName: "svg",
          boundingBox: svg.boundingBox ?? undefined,
        },
        evidence: {
          measuredValue: "no path/circle/rect/polygon/line/ellipse children found",
        },
        suggestedFix:
          "Verify the SVG's <use> href/symbol reference resolves, or that the SVG sprite sheet actually loaded.",
        detector: { id: "broken-svg-icon-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `broken-svg-icon:${svg.selector}`,
      });
    }

    return candidates;
  },
};
