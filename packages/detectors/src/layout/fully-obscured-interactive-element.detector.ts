import { PageContext, IssueCandidate, ElementSnapshot } from "@ui-quality/shared";
import { Detector } from "../types";

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

function stackOrder(el: ElementSnapshot): number {
  const z = Number.parseInt(el.computedStyle.zIndex, 10);
  return Number.isNaN(z) ? 0 : z;
}

const CONTAINMENT_RATIO = 0.95;
const MIN_AREA_PX = 100; // ~10x10 — ignore hairline/decorative elements

/**
 * A deliberately narrower, higher-confidence sibling of
 * `element-overlap-v1`: rather than flagging any substantial overlap
 * (which is inherently ambiguous — is this an intentional design
 * pattern or a bug?), this flags the specific case where an interactive
 * element is almost entirely covered (>=95% of its area) by a *later,
 * higher-stacked, non-ancestor* element. That combination — later in
 * paint order or a higher z-index, AND opaque enough to sit visually on
 * top, AND covering nearly the whole target — has no legitimate
 * "intentional overlay" reading the way partial overlap does: the
 * covered element is, as far as a real user's mouse/finger is
 * concerned, simply not clickable. That's why this reports at much
 * higher confidence and severity than the general overlap detector,
 * and is kept as a separate detector rather than a branch of it, so the
 * two failure modes (ambiguous vs. near-certain) can be triaged and
 * tuned independently.
 */
export const fullyObscuredInteractiveElementDetector: Detector = {
  id: "fully-obscured-interactive-element-v1",
  version: "1.0.0",
  category: "layout",
  requires: ["dom", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const seen = new Set<string>();

    const interactiveTargets = context.elements.filter(
      (el) => el.isInteractive && el.isVisible && el.boundingBox && boxArea(el.boundingBox) >= MIN_AREA_PX
    );

    const potentialCoverers = context.elements.filter(
      (el) => el.isVisible && el.boundingBox && boxArea(el.boundingBox) >= MIN_AREA_PX
    );

    for (const target of interactiveTargets) {
      if (!target.boundingBox || seen.has(target.selector)) continue;

      for (const coverer of potentialCoverers) {
        if (coverer.selector === target.selector) continue;
        if (!coverer.boundingBox) continue;
        if (isAncestorSelector(target.selector, coverer.selector) || isAncestorSelector(coverer.selector, target.selector)) continue;

        // A transparent element can't visually obscure anything — a
        // fully transparent click-blocker is a real bug too, but a
        // different one (and much rarer), so it's out of scope here to
        // keep this detector's confidence claim honest.
        const opacity = Number.parseFloat(coverer.computedStyle.opacity);
        if (!Number.isNaN(opacity) && opacity < 0.5) continue;

        const overlap = intersectionArea(target.boundingBox, coverer.boundingBox);
        if (overlap <= 0) continue;

        const targetArea = boxArea(target.boundingBox);
        const containmentRatio = overlap / targetArea;
        if (containmentRatio < CONTAINMENT_RATIO) continue;

        // "On top" is approximated by later DOM/paint order or a
        // strictly higher z-index within a positioned context — good
        // enough as a real-DOM heuristic without a full browser-side
        // paint-order computation.
        const targetIndex = context.elements.indexOf(target);
        const covererIndex = context.elements.indexOf(coverer);
        const covererLikelyOnTop = stackOrder(coverer) > stackOrder(target) || covererIndex > targetIndex;
        if (!covererLikelyOnTop) continue;

        seen.add(target.selector);
        candidates.push({
          category: "layout",
          issueType: "fully-obscured-interactive-element",
          title: "Interactive element is almost entirely covered by another element",
          description: `This ${target.tagName} is ${(containmentRatio * 100).toFixed(0)}% covered by "${coverer.selector}", which sits on top of it — a real user's click or tap here will most likely hit the covering element instead, making this control effectively unusable.`,
          severity: "critical",
          confidence: 0.85,
          element: { selector: target.selector, tagName: target.tagName, boundingBox: target.boundingBox },
          evidence: {
            measuredValue: `containmentRatio=${containmentRatio.toFixed(2)}`,
            raw: { coveringSelector: coverer.selector, coveringTag: coverer.tagName },
          },
          suggestedFix: "Fix the stacking/positioning so this element isn't covered — check z-index, positioning context, and paint order against the covering element.",
          detector: { id: "fully-obscured-interactive-element-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `fully-obscured-interactive-element:${target.selector}`,
        });
        break;
      }
    }

    return candidates;
  },
};
