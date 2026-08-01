import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const MIN_DECORATIVE_AREA_PX = 400; // 20x20 — below this, treat as icon-scale, lower severity

/**
 * Flags: request failures / HTTP >= 400, empty src, and "complete but
 * naturalWidth === 0" (loaded response, broken render). Confidence and
 * severity follow the spec table exactly:
 *   - 1.0 for status >= 400 or request failure
 *   - 0.95 for naturalWidth === 0 on a completed load
 *   - 0.85 for an empty src
 */
export const brokenImageDetector: Detector = {
  id: "broken-image-v1",
  version: "1.0.0",
  category: "image",
  requires: ["images", "network"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const img of context.images) {
      if (!img.isVisible) continue;

      const area = (img.boundingBox?.width ?? 0) * (img.boundingBox?.height ?? 0);
      const isLikelyDecorative = area > 0 && area < MIN_DECORATIVE_AREA_PX;

      // Case 1: request failure or HTTP error status.
      if (img.resourceFailure || (img.resourceStatus && img.resourceStatus >= 400)) {
        candidates.push({
          category: "image",
          issueType: "broken-image-network-error",
          title: "Image failed to load",
          description: img.resourceStatus
            ? `Image request returned HTTP ${img.resourceStatus}.`
            : `Image request failed: ${img.resourceFailure}.`,
          severity: isLikelyDecorative ? "medium" : "critical",
          confidence: 1.0,
          element: {
            selector: img.selector,
            tagName: "img",
            boundingBox: img.boundingBox ?? undefined,
          },
          evidence: {
            resourceUrl: img.currentSrc ?? img.src,
            httpStatus: img.resourceStatus,
            measuredValue: img.resourceFailure ?? String(img.resourceStatus),
          },
          suggestedFix:
            "Verify the image asset exists at the referenced URL and that the CDN/hosting path is correct.",
          detector: { id: "broken-image-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `broken-image:${img.currentSrc ?? img.src ?? "unknown"}`,
        });
        continue;
      }

      // Case 2: loaded (complete=true) but rendered with zero natural size.
      if (img.complete && img.naturalWidth === 0 && img.src) {
        candidates.push({
          category: "image",
          issueType: "broken-image-zero-dimensions",
          title: "Image renders with zero dimensions",
          description:
            "The image finished loading but reports naturalWidth/naturalHeight of 0, indicating a broken or corrupt image resource.",
          severity: isLikelyDecorative ? "low" : "high",
          confidence: 0.95,
          element: {
            selector: img.selector,
            tagName: "img",
            boundingBox: img.boundingBox ?? undefined,
          },
          evidence: {
            resourceUrl: img.currentSrc ?? img.src,
            measuredValue: `naturalWidth=${img.naturalWidth}, naturalHeight=${img.naturalHeight}`,
          },
          suggestedFix: "Check that the image file is not corrupt or an empty/zero-byte file.",
          detector: { id: "broken-image-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `broken-image:${img.currentSrc ?? img.src ?? "unknown"}`,
        });
        continue;
      }

      // Case 3: empty src on a visible <img>.
      if (!img.src && !img.currentSrc) {
        candidates.push({
          category: "image",
          issueType: "broken-image-empty-src",
          title: "Image element has no source",
          description: "A visible <img> element has no src attribute or an empty src.",
          severity: "medium",
          confidence: 0.85,
          element: { selector: img.selector, tagName: "img", boundingBox: img.boundingBox ?? undefined },
          evidence: { measuredValue: "src is empty or missing" },
          suggestedFix: "Provide a valid src, or remove the element if it is not needed.",
          detector: { id: "broken-image-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `broken-image-empty-src:${img.selector}`,
        });
      }
    }

    return candidates;
  },
};
