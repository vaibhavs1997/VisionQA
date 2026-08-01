import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Flags elements that are entirely outside the viewport (or have zero
 * intersection with it) while carrying non-trivial content or interactive
 * behavior — the classic "menu item that's supposed to be on-screen but
 * got pushed off by a layout bug" defect.
 *
 * Explicitly excludes the common, *intentional* off-canvas pattern (slide-in
 * navigation drawers built with `transform: translateX/Y`), since those are
 * off-screen by design until toggled open.
 */
export const elementOutsideViewportDetector: Detector = {
  id: "element-outside-viewport-v1",
  version: "1.0.0",
  category: "layout",
  requires: ["dom", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const { viewportWidth, viewportHeight } = context.page;

    for (const el of context.elements) {
      if (!el.boundingBox) continue;
      if (el.viewportIntersection > 0) continue; // has at least some overlap — not our concern here
      if (el.computedStyle.display === "none" || el.computedStyle.visibility === "hidden") continue;
      if (el.ariaHidden) continue;
      if (el.isInsideHorizontalScrollContainer) continue; // e.g. carousel items scrolled out of view — intentional

      // Intentional off-canvas patterns (slide-in drawers/menus) almost
      // always rely on a CSS transform to move themselves off-screen.
      if (el.computedStyle.transform && el.computedStyle.transform !== "none") continue;

      const isFullyOffscreen =
        el.boundingBox.x + el.boundingBox.width < 0 ||
        el.boundingBox.x > viewportWidth ||
        el.boundingBox.y + el.boundingBox.height < 0 ||
        el.boundingBox.y > viewportHeight;
      if (!isFullyOffscreen) continue;

      if (!el.hasMeaningfulChildContent && !el.isInteractive) continue;

      const confidence = el.isInteractive ? 0.9 : 0.7;

      candidates.push({
        category: "layout",
        issueType: "element-outside-viewport",
        title: "Element positioned outside the visible viewport",
        description: el.isInteractive
          ? "An interactive element with content is positioned entirely outside the viewport, making it unreachable."
          : "An element with visible content is positioned entirely outside the viewport.",
        severity: el.isInteractive ? "high" : "medium",
        confidence,
        element: {
          selector: el.selector,
          tagName: el.tagName,
          text: el.text?.slice(0, 120),
          boundingBox: el.boundingBox,
        },
        evidence: {
          measuredValue: `bbox=(${Math.round(el.boundingBox.x)},${Math.round(el.boundingBox.y)},${Math.round(
            el.boundingBox.width
          )}x${Math.round(el.boundingBox.height)})`,
          expectedValue: `viewport=${viewportWidth}x${viewportHeight}`,
        },
        suggestedFix:
          "Check for an incorrect absolute/fixed position, a parent with unintended overflow, or a missing responsive breakpoint pushing this element off-screen.",
        detector: { id: "element-outside-viewport-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `element-outside-viewport:${el.selector}`,
      });
    }

    return candidates;
  },
};
