import { IssueSeverity } from "@ui-quality/shared";
import { DeduplicatedCandidate } from "./deduplicator";

const SEVERITY_WEIGHT: Record<IssueSeverity, number> = {
  critical: 18,
  high: 10,
  medium: 5,
  low: 2,
};

export interface ScoringInput {
  issue: DeduplicatedCandidate;
  viewportName: string;
}

export interface ScoreBreakdown {
  score: number;
  totalWeightedImpact: number;
  perIssueImpact: Array<{
    issueType: string;
    severity: IssueSeverity;
    weightedImpact: number;
  }>;
}

/**
 * Implements: weightedImpact = severityWeight * confidence * elementImportance
 * * viewportWeight, with a recurrence-damping cap so an issue affecting
 * many elements doesn't linearly dominate the score, then
 * score = clamp(100 - sum(weightedImpact), 0, 100).
 *
 * elementImportance: layout/network/image issues on visibly large or
 * interactive elements count more than issues on small/decorative ones.
 * viewportWeight: mobile-only layout blockers are weighted higher,
 * reflecting that mobile traffic share and mobile-only breakage are
 * disproportionately costly in practice.
 */
export function computeUiQualityScore(inputs: ScoringInput[]): ScoreBreakdown {
  const perIssueImpact: ScoreBreakdown["perIssueImpact"] = [];
  let totalWeightedImpact = 0;

  for (const { issue, viewportName } of inputs) {
    const { candidate, affectedElementCount } = issue;
    const severityWeight = SEVERITY_WEIGHT[candidate.severity];

    const boundingBox = candidate.element?.boundingBox;
    const area = boundingBox ? boundingBox.width * boundingBox.height : 0;
    // Larger/interactive elements matter more; default to 1.0 when we
    // have no geometry to judge importance from (e.g. network-only issues).
    const elementImportance = area > 20000 ? 1.2 : area > 0 ? 1.0 : 1.0;

    const viewportWeight = viewportName === "mobile" && candidate.category === "layout" ? 1.2 : 1.0;

    // Recurrence handling: an issue affecting more elements is genuinely
    // worse than the same issue affecting one element (10 broken images
    // from a missing CDN asset is worse than 1), but it should NOT count
    // N times as bad — it's one root cause, not N independent defects.
    // This grows sub-linearly (log2) from a baseline of 1.0 at
    // affectedElementCount=1 and saturates at a hard ceiling so a root
    // cause affecting hundreds of elements still can't dominate the score.
    const RECURRENCE_GROWTH_RATE = 0.25;
    const RECURRENCE_MULTIPLIER_CEILING = 2.5;
    const recurrenceMultiplier = Math.min(
      RECURRENCE_MULTIPLIER_CEILING,
      1 + RECURRENCE_GROWTH_RATE * Math.log2(affectedElementCount)
    );

    const weightedImpact =
      severityWeight * candidate.confidence * elementImportance * viewportWeight * recurrenceMultiplier;

    totalWeightedImpact += weightedImpact;
    perIssueImpact.push({
      issueType: candidate.issueType,
      severity: candidate.severity,
      weightedImpact: Math.round(weightedImpact * 100) / 100,
    });
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - totalWeightedImpact)));

  return { score, totalWeightedImpact: Math.round(totalWeightedImpact * 100) / 100, perIssueImpact };
}
