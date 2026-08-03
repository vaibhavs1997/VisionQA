import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

// A 15% deviation between the image's natural (intrinsic) aspect ratio
// and its rendered aspect ratio is well past normal sub-pixel rounding
// and reads as visibly stretched/squished, not just a rendering quirk.
const DISTORTION_THRESHOLD = 0.15;
const MIN_RENDERED_DIMENSION = 20; // ignore tiny icons where rounding dominates the ratio

/**
 * Flags images whose rendered box doesn't match their natural aspect
 * ratio — the classic "someone set a fixed width and height that don't
 * match the source image" bug, which visibly stretches or squishes the
 * image. Deliberately separate from `broken-image-v1` (load failures)
 * — this is about a successfully-loaded image rendered wrong, a
 * different failure mode with a different fix.
 */
export const imageAspectRatioDistortedDetector: Detector = {
  id: "image-aspect-ratio-distorted-v1",
  version: "1.0.0",
  category: "image",
  requires: ["images", "geometry"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const img of context.images) {
      if (!img.isVisible || !img.complete) continue;
      if (!img.naturalWidth || !img.naturalHeight) continue; // broken-image-v1's territory
      if (!img.boundingBox) continue;

      const { width, height } = img.boundingBox;
      if (width < MIN_RENDERED_DIMENSION || height < MIN_RENDERED_DIMENSION) continue;

      const naturalRatio = img.naturalWidth / img.naturalHeight;
      const renderedRatio = width / height;
      const deviation = Math.abs(renderedRatio - naturalRatio) / naturalRatio;
      if (deviation < DISTORTION_THRESHOLD) continue;

      candidates.push({
        category: "image",
        issueType: "image-aspect-ratio-distorted",
        title: renderedRatio > naturalRatio ? "Image appears stretched horizontally" : "Image appears squished/stretched vertically",
        description: `This image's natural size is ${img.naturalWidth}×${img.naturalHeight} (ratio ${naturalRatio.toFixed(2)}), but it renders at ${Math.round(width)}×${Math.round(height)} (ratio ${renderedRatio.toFixed(2)}) — a ${(deviation * 100).toFixed(0)}% deviation, well past normal rounding.`,
        severity: deviation > 0.35 ? "medium" : "low",
        confidence: 0.7,
        element: { selector: img.selector, tagName: "img", boundingBox: img.boundingBox },
        evidence: {
          measuredValue: `rendered ${Math.round(width)}x${Math.round(height)} vs natural ${img.naturalWidth}x${img.naturalHeight}`,
          expectedValue: `aspect ratio within ${(DISTORTION_THRESHOLD * 100).toFixed(0)}% of ${naturalRatio.toFixed(2)}`,
        },
        suggestedFix: "Set only one of width/height explicitly (or use object-fit: contain/cover) so the browser preserves the image's natural aspect ratio.",
        detector: { id: "image-aspect-ratio-distorted-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `image-aspect-ratio-distorted:${img.selector}`,
      });
    }

    return candidates;
  },
};
