import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

// WCAG 2.2 Success Criterion 2.5.8 (Target Size Minimum) sets 24x24 CSS
// px as the accessibility floor; Apple/Google platform guidance (44pt /
// 48dp) is stricter but is a design recommendation, not a normative
// minimum — 24px is the defensible, citable threshold to flag against.
const MIN_TARGET_PX = 24;
const MIN_AREA = MIN_TARGET_PX * MIN_TARGET_PX;

/**
 * Flags interactive elements whose rendered bounding box is smaller than
 * the WCAG 2.5.8 minimum target size (24x24 CSS px) — small tap targets
 * are hard to hit accurately on touchscreens and disproportionately
 * affect users with motor impairments or larger fingers.
 *
 * Only runs against narrow viewports (< 768px) where touch is the
 * primary input — a small click target on a desktop/mouse viewport
 * isn't the same usability problem this check is about, and flagging it
 * there would just be noise against a non-issue.
 *
 * Elements that are part of a visually/logically larger inline group
 * (e.g. a small icon inside a padded parent button) are hard to tell
 * apart from a genuinely tiny standalone target without layout
 * simulation, so confidence is kept moderate rather than near-certain.
 */
export const tapTargetTooSmallDetector: Detector = {
  id: "tap-target-too-small-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    if (context.scan.viewport.width >= 768) return candidates;

    for (const el of context.elements) {
      if (!el.isInteractive || !el.isVisible || !el.boundingBox) continue;

      const { width, height } = el.boundingBox;
      if (width <= 0 || height <= 0) continue;

      const area = width * height;
      if (area >= MIN_AREA) continue;
      // A target can be "small" on one axis but fine on the other (e.g. a
      // full-width 20px-tall row) — that's a much milder problem than a
      // target that's small on both axes, so only flag when both
      // dimensions are under the floor.
      if (width >= MIN_TARGET_PX || height >= MIN_TARGET_PX) continue;

      candidates.push({
        category: "accessibility",
        issueType: "tap-target-too-small",
        title: "Touch target smaller than the 24×24px minimum",
        description: `This interactive element renders at ${Math.round(width)}×${Math.round(height)}px on a ${context.scan.viewport.name} viewport, below the WCAG 2.5.8 minimum target size of 24×24px — it will be hard to tap accurately, especially for users with limited dexterity.`,
        severity: "medium",
        confidence: 0.65,
        element: { selector: el.selector, tagName: el.tagName, boundingBox: el.boundingBox },
        evidence: {
          measuredValue: `${Math.round(width)}x${Math.round(height)}px`,
          expectedValue: `>=${MIN_TARGET_PX}x${MIN_TARGET_PX}px`,
        },
        suggestedFix: "Increase the element's padding or minimum touch area to at least 24x24px (44x44px is a safer, more comfortable target).",
        detector: { id: "tap-target-too-small-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `tap-target-too-small:${el.selector}`,
      });
    }

    return candidates;
  },
};
