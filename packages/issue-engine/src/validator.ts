import { IssueCandidate, IssueCategory } from "@ui-quality/shared";

/**
 * Per-category minimum confidence to report. Overlap-style/ambiguous
 * categories (not present in Phase 0's five detectors, but the hook is
 * here for Phase 1) get a higher bar than near-certain categories like
 * broken images. Per architecture principle: false-positive reduction
 * is a first-class subsystem, not a cleanup pass.
 */
const MIN_CONFIDENCE_BY_CATEGORY: Partial<Record<IssueCategory, number>> = {
  image: 0.6,
  network: 0.6,
  layout: 0.7,
  content: 0.5,
  accessibility: 0.6,
  technical: 0.6,
  "visual-ai": 0.75,
  seo: 0.7,
};

const DEFAULT_MIN_CONFIDENCE = 0.6;

export interface ValidationResult {
  accepted: IssueCandidate[];
  suppressed: Array<{ candidate: IssueCandidate; reason: string }>;
}

/**
 * Applies confidence thresholds. Detector-level suppression (hidden
 * elements, aria-hidden, decorative-image heuristics, etc.) already
 * happens inside each detector — this is the second, cross-cutting
 * gate that applies uniformly regardless of which detector produced
 * the candidate.
 */
export function validateCandidates(candidates: IssueCandidate[]): ValidationResult {
  const accepted: IssueCandidate[] = [];
  const suppressed: ValidationResult["suppressed"] = [];

  for (const candidate of candidates) {
    const threshold = MIN_CONFIDENCE_BY_CATEGORY[candidate.category] ?? DEFAULT_MIN_CONFIDENCE;
    if (candidate.confidence < threshold) {
      suppressed.push({
        candidate,
        reason: `confidence ${candidate.confidence.toFixed(2)} below threshold ${threshold} for category "${candidate.category}"`,
      });
      continue;
    }
    accepted.push(candidate);
  }

  return { accepted, suppressed };
}
