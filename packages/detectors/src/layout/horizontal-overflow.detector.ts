import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const IGNORE_THRESHOLD_PX = 8; // below this, treat as rendering noise/sub-pixel rounding
const HIGH_CONFIDENCE_THRESHOLD_PX = 24;

/**
 * Page-level check: documentElement.scrollWidth vs viewportWidth. If
 * overflow exists, walk visible elements to find the likely culprit(s) —
 * any element whose bounding box extends past the right edge (or before
 * the left edge) of the viewport by more than the threshold. Elements
 * that are legitimate horizontal-scroll containers (overflow-x: auto/
 * scroll) are excluded from being flagged as "unintended" overflow.
 */
export const horizontalOverflowDetector: Detector = {
  id: "horizontal-overflow-v1",
  version: "1.0.0",
  category: "layout",
  requires: ["geometry", "dom"],
  run(context: PageContext): IssueCandidate[] {
    const { page } = context;
    const overflowPx = page.scrollWidth - page.viewportWidth;

    if (!page.hasHorizontalScroll || overflowPx <= IGNORE_THRESHOLD_PX) {
      return [];
    }

    // Find candidate culprits: visible elements extending past the
    // viewport bounds, excluding elements that are themselves intentional
    // scroll containers.
    const culprits = context.elements.filter((el) => {
      if (!el.isVisible || !el.boundingBox) return false;
      const isScrollContainer =
        el.computedStyle.overflowX === "auto" || el.computedStyle.overflowX === "scroll";
      if (isScrollContainer) return false;
      const right = el.boundingBox.x + el.boundingBox.width;
      const extendsRight = right > page.viewportWidth + IGNORE_THRESHOLD_PX;
      const extendsLeft = el.boundingBox.x < -IGNORE_THRESHOLD_PX;
      return extendsRight || extendsLeft;
    });

    // Prefer the largest/most specific culprit (smallest element that
    // still overflows) as the primary evidence — deepest in the DOM tends
    // to be the actual offending node rather than a container.
    const primaryCulprit = culprits.sort((a, b) => {
      const areaA = (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0);
      const areaB = (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0);
      return areaA - areaB;
    })[0];

    const confidence = primaryCulprit
      ? overflowPx > HIGH_CONFIDENCE_THRESHOLD_PX
        ? 1.0
        : 0.9
      : 0.85; // page-level overflow confirmed, but no specific culprit identified

    const isMobile = page.viewportWidth < 500;
    const severity: IssueCandidate["severity"] =
      isMobile && overflowPx > 48 ? "high" : overflowPx > HIGH_CONFIDENCE_THRESHOLD_PX ? "high" : "medium";

    return [
      {
        category: "layout",
        issueType: "horizontal-overflow",
        title: "Page content overflows viewport horizontally",
        description: primaryCulprit
          ? `The page scrolls horizontally by ${overflowPx}px, primarily caused by "${primaryCulprit.selector}".`
          : `The page scrolls horizontally by ${overflowPx}px; a specific offending element could not be isolated.`,
        severity,
        confidence,
        element: primaryCulprit
          ? {
              selector: primaryCulprit.selector,
              tagName: primaryCulprit.tagName,
              boundingBox: primaryCulprit.boundingBox ?? undefined,
            }
          : undefined,
        evidence: {
          measuredValue: `scrollWidth=${page.scrollWidth}, viewportWidth=${page.viewportWidth}`,
          expectedValue: `scrollWidth <= viewportWidth + ${IGNORE_THRESHOLD_PX}`,
        },
        suggestedFix: primaryCulprit
          ? `Constrain "${primaryCulprit.selector}" with max-width: 100% or wrap it in a container with overflow-x: hidden.`
          : "Inspect elements near the page edges for fixed widths, negative margins, or unconstrained media.",
        detector: { id: "horizontal-overflow-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `horizontal-overflow:${page.viewportWidth}:${primaryCulprit?.selector ?? "page-level"}`,
      },
    ];
  },
};
