import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "./types";

// Phase 0 carryover
import { brokenImageDetector } from "./image/broken-image.detector";
import { failedResourceDetector } from "./network/failed-resource.detector";
import { horizontalOverflowDetector } from "./layout/horizontal-overflow.detector";
import { missingAltDetector } from "./accessibility/missing-alt.detector";
import { placeholderContentDetector } from "./content/placeholder-content.detector";

// Phase 1 additions
import { elementOutsideViewportDetector } from "./layout/element-outside-viewport.detector";
import { textClippingDetector } from "./layout/text-clipping.detector";
import { textOverflowDetector } from "./layout/text-overflow.detector";
import { elementOverlapDetector } from "./layout/element-overlap.detector";
import { missingFormLabelDetector } from "./accessibility/missing-form-label.detector";
import { missingAccessibleNameDetector } from "./accessibility/missing-accessible-name.detector";
import { fontLoadFailureDetector } from "./technical/font-load-failure.detector";
import { brokenSvgIconDetector } from "./technical/broken-svg-icon.detector";
import { emptyComponentDetector } from "./content/empty-component.detector";
import { consoleUiErrorDetector } from "./technical/console-ui-error.detector";
import { lowContrastCandidateDetector } from "./accessibility/low-contrast-candidate.detector";
import { unexpectedDisabledCtaDetector } from "./content/unexpected-disabled-cta.detector";

// Phase 5 additions — deeper accessibility coverage + a higher-confidence
// counterpart to element-overlap, all built on data PageContext already
// collects (no new browser-side collection required).
import { duplicateElementIdDetector } from "./technical/duplicate-element-id.detector";
import { headingHierarchySkipDetector } from "./accessibility/heading-hierarchy-skip.detector";
import { tapTargetTooSmallDetector } from "./accessibility/tap-target-too-small.detector";
import { ambiguousLinkTextDetector } from "./accessibility/ambiguous-link-text.detector";
import { fullyObscuredInteractiveElementDetector } from "./layout/fully-obscured-interactive-element.detector";

// Tier 1 additions — SEO/crawler visibility pack + two more
// zero-collector-change detectors, closing out the checklist categories
// that were previously at zero coverage.
import { metaTagsDetector } from "./seo/meta-tags.detector";
import { openGraphTagsDetector } from "./seo/open-graph-tags.detector";
import { robotsAndSitemapDetector } from "./seo/robots-and-sitemap.detector";
import { blockedCriticalResourceDetector } from "./seo/blocked-critical-resource.detector";
import { fontSizeTooSmallDetector } from "./accessibility/font-size-too-small.detector";
import { imageAspectRatioDistortedDetector } from "./image/image-aspect-ratio-distorted.detector";

/**
 * The full Phase 1 detector set — 17 detectors behind the plugin
 * registry (Phase 1 acceptance criteria: at least 15). Adding a Phase 2+
 * detector means importing it here and appending it to this array —
 * nothing else in the pipeline (CLI, PageContext collection, report
 * writer) needs to change.
 *
 * Note: "Responsive delta issue" from the Phase 1 spec is NOT a detector
 * in this registry — it's a cross-viewport correlation that necessarily
 * operates across multiple PageContexts (one per viewport) rather than
 * a single one, so it's implemented as a post-processing step in
 * issue-engine's `responsive-delta.ts`, run by the CLI after all
 * viewports for a scan have produced their issues.
 */
export const PHASE_1_DETECTORS: Detector[] = [
  brokenImageDetector,
  failedResourceDetector,
  horizontalOverflowDetector,
  missingAltDetector,
  placeholderContentDetector,
  elementOutsideViewportDetector,
  textClippingDetector,
  textOverflowDetector,
  elementOverlapDetector,
  missingFormLabelDetector,
  missingAccessibleNameDetector,
  fontLoadFailureDetector,
  brokenSvgIconDetector,
  emptyComponentDetector,
  consoleUiErrorDetector,
  lowContrastCandidateDetector,
  unexpectedDisabledCtaDetector,
  duplicateElementIdDetector,
  headingHierarchySkipDetector,
  tapTargetTooSmallDetector,
  ambiguousLinkTextDetector,
  fullyObscuredInteractiveElementDetector,
  metaTagsDetector,
  openGraphTagsDetector,
  robotsAndSitemapDetector,
  blockedCriticalResourceDetector,
  fontSizeTooSmallDetector,
  imageAspectRatioDistortedDetector,
];

/** @deprecated kept as an alias so any Phase 0 reference doesn't break; use PHASE_1_DETECTORS. */
export const PHASE_0_DETECTORS = PHASE_1_DETECTORS;

export class DetectorRegistry {
  constructor(private readonly detectors: Detector[] = PHASE_1_DETECTORS) {}

  list(): Detector[] {
    return this.detectors;
  }

  async runAll(context: PageContext): Promise<IssueCandidate[]> {
    const all: IssueCandidate[] = [];
    for (const detector of this.detectors) {
      try {
        const result = await detector.run(context);
        all.push(...result);
      } catch (err) {
        // A single detector failure should never take down the whole
        // scan — log and continue with the rest of the registry.
        // eslint-disable-next-line no-console
        console.error(
          `[detector-registry] detector "${detector.id}" threw an error: ${
            err instanceof Error ? err.message : err
          }`
        );
      }
    }
    return all;
  }
}
