import { PageContext, IssueCandidate, ElementSnapshot } from "@ui-quality/shared";
import { Detector } from "../types";

const OVERLAY_ROLES = new Set([
  "dialog",
  "alertdialog",
  "tooltip",
  "menu",
  "menuitem",
  "listbox",
  "combobox",
  "popup",
]);

const OVERLAY_CLASS_PATTERN = /modal|tooltip|dropdown|overlay|popover|toast|drawer|sheet/i;

function isKnownIntentionalOverlay(el: ElementSnapshot): boolean {
  if (el.role && OVERLAY_ROLES.has(el.role)) return true;
  if (el.attributes["aria-modal"] === "true") return true;
  const className = el.attributes.class || "";
  if (OVERLAY_CLASS_PATTERN.test(className)) return true;
  return false;
}

function isAncestorSelector(a: string, b: string): boolean {
  return b === a || b.startsWith(`${a} > `);
}

function boxArea(box: { width: number; height: number }): number {
  return box.width * box.height;
}

function intersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlapX * overlapY;
}

/**
 * Flags pairs of visible, meaningfully-sized elements whose bounding boxes
 * intersect substantially without an intentional-overlay signal (ARIA
 * dialog/tooltip/menu roles, aria-modal, or common overlay class-name
 * patterns) and without a clear z-index-differentiated stacking context.
 *
 * Explicitly excludes near-total containment (one box almost entirely
 * inside another) since that's the normal parent/child nesting
 * relationship, not a layout defect — we only care about *sibling-like*
 * partial overlap, which is what visually reads as broken.
 *
 * This is the highest false-positive-risk detector in Phase 1 (per the
 * architecture doc), so confidence is kept deliberately moderate and
 * candidates rely on the Issue Engine's category-level confidence
 * threshold (0.7 for layout) to filter out the weakest signals — this is
 * intentionally the detector most likely to warrant AI validation in
 * Phase 2 rather than being fully resolved deterministically.
 */
export const elementOverlapDetector: Detector = {
  id: "element-overlap-v1",
  version: "1.0.0",
  category: "layout",
  requires: ["dom", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const MIN_AREA_PX = 400; // ~20x20 — ignore tiny elements (borders, dividers, spacers)
    const CONTAINMENT_RATIO = 0.9;
    const OVERLAP_RATIO_THRESHOLD = 0.2;
    const MAX_CANDIDATES = 250; // cap the pairwise scan for pathologically large pages

    const relevant = context.elements
      .filter(
        (el) =>
          el.isVisible &&
          el.boundingBox &&
          boxArea(el.boundingBox) >= MIN_AREA_PX &&
          (el.isInteractive || (el.visibleText && el.visibleText.length > 0))
      )
      .slice(0, MAX_CANDIDATES);

    const seenPairs = new Set<string>();

    for (let i = 0; i < relevant.length; i++) {
      for (let j = i + 1; j < relevant.length; j++) {
        const a = relevant[i];
        const b = relevant[j];
        if (!a.boundingBox || !b.boundingBox) continue;

        // Ancestor/descendant pairs are normal DOM nesting, never a
        // layout-overlap bug — checked via selector-chain prefix matching
        // (buildSelector always encodes the full ancestor chain), which is
        // far more reliable than an area-ratio heuristic: a descendant
        // that overflows its ancestor (e.g. a 1200px-wide banner inside a
        // 390px-wide body) can have LESS geometric containment than a
        // genuine sibling overlap, even though it's still just nesting.
        if (isAncestorSelector(a.selector, b.selector) || isAncestorSelector(b.selector, a.selector)) continue;

        // Skip if either participant is a known intentional overlay.
        if (isKnownIntentionalOverlay(a) || isKnownIntentionalOverlay(b)) continue;

        // Skip if the two elements sit in clearly different, deliberate
        // stacking contexts (one is fixed/absolute with a distinct
        // z-index — the standard "floating over content" pattern).
        const aFloating = a.computedStyle.position === "fixed" || a.computedStyle.position === "absolute";
        const bFloating = b.computedStyle.position === "fixed" || b.computedStyle.position === "absolute";
        const aZ = Number.parseInt(a.computedStyle.zIndex, 10);
        const bZ = Number.parseInt(b.computedStyle.zIndex, 10);
        const hasDifferentiatedZ = !Number.isNaN(aZ) && !Number.isNaN(bZ) && aZ !== bZ;
        if ((aFloating || bFloating) && hasDifferentiatedZ) continue;

        const overlap = intersectionArea(a.boundingBox, b.boundingBox);
        if (overlap <= 0) continue;

        const areaA = boxArea(a.boundingBox);
        const areaB = boxArea(b.boundingBox);
        const smaller = Math.min(areaA, areaB);
        const overlapRatio = overlap / smaller;

        // Near-total containment is normal parent/child nesting, not a bug.
        if (overlapRatio >= CONTAINMENT_RATIO) continue;
        if (overlapRatio < OVERLAP_RATIO_THRESHOLD) continue;

        const pairKey = [a.selector, b.selector].sort().join("|");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const bothInteractive = a.isInteractive && b.isInteractive;
        let confidence = 0.55 + overlapRatio * 0.25;
        if (bothInteractive) confidence += 0.15;
        confidence = Math.min(0.9, confidence);

        candidates.push({
          category: "layout",
          issueType: "element-overlap",
          title: bothInteractive
            ? "Two interactive elements visually overlap"
            : "Elements visually overlap unexpectedly",
          description: bothInteractive
            ? "Two clickable/interactive elements overlap, which can make one unreachable or cause the wrong element to receive clicks."
            : "Two elements with visible content overlap without an apparent intentional-overlay pattern (modal, tooltip, dropdown).",
          severity: bothInteractive ? "high" : "medium",
          confidence,
          element: { selector: a.selector, tagName: a.tagName, boundingBox: a.boundingBox },
          evidence: {
            measuredValue: `overlapRatio=${overlapRatio.toFixed(2)}`,
            raw: { otherSelector: b.selector, otherTagName: b.tagName },
          },
          suggestedFix:
            "Check z-index/positioning and layout flow — verify this overlap is intentional (e.g. a designed overlay) or fix the conflicting positioning.",
          detector: { id: "element-overlap-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `element-overlap:${pairKey}`,
        });
      }
    }

    return candidates;
  },
};
