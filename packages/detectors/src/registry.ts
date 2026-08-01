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
