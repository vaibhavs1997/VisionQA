import { PageContext, IssueCandidate, ElementSnapshot } from "@ui-quality/shared";
import { AiValidationRequest } from "../types";

const NEARBY_RADIUS_PX = 150;
const MAX_NEARBY_ELEMENTS = 6;

function boxCenter(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Finds elements spatially near the candidate's primary element — this
 * is what lets the AI distinguish "two elements overlapping in empty
 * space" from "two elements overlapping in a dense toolbar where that's
 * normal," without having to hand it the entire page's DOM.
 */
function findNearbyElements(context: PageContext, primary: ElementSnapshot | undefined): ElementSnapshot[] {
  if (!primary?.boundingBox) return [];
  const center = boxCenter(primary.boundingBox);

  return context.elements
    .filter((el) => el.selector !== primary.selector && el.boundingBox && el.isVisible)
    .map((el) => ({ el, dist: distance(center, boxCenter(el.boundingBox!)) }))
    .filter(({ dist }) => dist <= NEARBY_RADIUS_PX)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_NEARBY_ELEMENTS)
    .map(({ el }) => el);
}

/**
 * Builds the domContext portion of an AiValidationRequest for a given
 * candidate. Screenshot paths (crop/annotated crop) are attached
 * separately by the AiService, since building those requires disk I/O
 * (sharp) that doesn't belong in a pure context-assembly function.
 */
export function buildContextPack(
  context: PageContext,
  candidate: IssueCandidate
): Pick<AiValidationRequest, "domContext"> {
  const primary = candidate.element?.selector
    ? context.elements.find((el) => el.selector === candidate.element!.selector)
    : undefined;

  return {
    domContext: {
      element: primary,
      nearbyElements: findNearbyElements(context, primary),
      pageTitle: context.page.title,
    },
  };
}
