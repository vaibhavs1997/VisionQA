import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const SMALL_ICON_AREA_PX = 900; // ~30x30 — likely an icon, lower severity

/**
 * Flags visible <img> elements with meaningful size that have no alt
 * attribute and no other accessible name (aria-label/aria-labelledby).
 * Skips role="presentation" and aria-hidden="true" images, which are
 * explicitly marked decorative and should never be flagged.
 */
export const missingAltDetector: Detector = {
  id: "missing-alt-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["images", "dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const img of context.images) {
      if (!img.isVisible) continue;
      if (img.ariaHidden) continue;
      if (img.role === "presentation" || img.role === "none") continue;

      const hasAlt = img.alt !== undefined && img.alt.trim().length > 0;
      if (hasAlt) continue;

      // alt="" (explicitly empty) on a small image is a common and
      // legitimate decorative pattern — don't flag it.
      const area = (img.boundingBox?.width ?? 0) * (img.boundingBox?.height ?? 0);
      const isLikelyDecorative = area > 0 && area < SMALL_ICON_AREA_PX;
      if (img.alt === "" && isLikelyDecorative) continue;

      const confidence = img.alt === undefined ? 0.95 : 0.75; // absent vs. present-but-empty on a larger image

      candidates.push({
        category: "accessibility",
        issueType: "missing-alt-text",
        title: "Image missing accessible alt text",
        description:
          img.alt === undefined
            ? "This image has no alt attribute at all, so screen readers cannot describe it."
            : "This image has an empty alt attribute despite appearing to be meaningful content, not a decorative icon.",
        severity: isLikelyDecorative ? "low" : "medium",
        confidence,
        element: {
          selector: img.selector,
          tagName: "img",
          boundingBox: img.boundingBox ?? undefined,
        },
        evidence: {
          resourceUrl: img.currentSrc ?? img.src,
          measuredValue: img.alt === undefined ? "alt attribute absent" : "alt=\"\"",
        },
        suggestedFix:
          "Add a concise, descriptive alt attribute, or alt=\"\" only if the image is purely decorative.",
        detector: { id: "missing-alt-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `missing-alt:${img.selector}`,
      });
    }

    return candidates;
  },
};
