import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const STRUCTURALLY_IMPORTANT_TAGS = new Set(["h1", "h2", "h3", "button"]);
const IMPORTANT_CLASS_PATTERN = /\b(card|cta|widget|panel|tile|banner)\b/i;
const MEDIA_LEAF_TAGS = new Set(["img", "svg", "video", "picture", "iframe", "canvas", "audio", "embed", "object"]);

/**
 * Flags structurally important elements (headings, buttons, and elements
 * whose class name suggests a card/CTA/widget/panel) that are visible and
 * meaningfully sized but render with no text and no meaningful child
 * image/icon — the "content never loaded into this container" defect,
 * distinct from a genuinely decorative empty div.
 */
export const emptyComponentDetector: Detector = {
  id: "empty-component-v1",
  version: "1.0.0",
  category: "content",
  requires: ["dom", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const MIN_AREA_PX = 400;

    for (const el of context.elements) {
      if (!el.isVisible || !el.boundingBox) continue;
      if (MEDIA_LEAF_TAGS.has(el.tagName)) continue; // leaf/media elements are covered by their own detectors
      if (boxArea(el.boundingBox) < MIN_AREA_PX) continue;

      const className = el.attributes.class || "";
      const isStructurallyImportant =
        STRUCTURALLY_IMPORTANT_TAGS.has(el.tagName) || IMPORTANT_CLASS_PATTERN.test(className);
      if (!isStructurallyImportant) continue;

      if (el.hasMeaningfulChildContent) continue;
      const text = (el.visibleText ?? "").trim();
      if (text.length > 0) continue;

      const confidence = STRUCTURALLY_IMPORTANT_TAGS.has(el.tagName) ? 0.75 : 0.55;

      candidates.push({
        category: "content",
        issueType: "empty-component",
        title: "Structurally important element renders with no content",
        description: `A <${el.tagName}>${
          className ? ` (class="${className}")` : ""
        } that looks like it should contain content is visible but empty — likely a data-loading or template-binding failure.`,
        severity: "medium",
        confidence,
        element: {
          selector: el.selector,
          tagName: el.tagName,
          boundingBox: el.boundingBox,
        },
        evidence: {
          measuredValue: "no text content and no meaningful child image/icon",
        },
        suggestedFix:
          "Check the data source or template binding feeding this component — it's likely rendering before data arrives, or a binding key is wrong.",
        detector: { id: "empty-component-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `empty-component:${el.selector}`,
      });
    }

    return candidates;
  },
};

function boxArea(box: { width: number; height: number }): number {
  return box.width * box.height;
}
