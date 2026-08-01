import { IssueCandidate } from "@ui-quality/shared";

export interface DeduplicatedCandidate {
  candidate: IssueCandidate;
  affectedElementCount: number;
}

/**
 * Groups candidates by rootCauseSignature (falling back to a signature
 * derived from issueType + selector when a detector didn't set one).
 * Within a group, keeps the highest-confidence candidate as the
 * representative and records how many elements/instances it covers —
 * this is what turns "10 broken images from the same missing CDN asset"
 * into one reported issue with affectedElementCount=10, per the
 * false-positive-reduction architecture.
 */
export function deduplicateCandidates(candidates: IssueCandidate[]): DeduplicatedCandidate[] {
  const groups = new Map<string, IssueCandidate[]>();

  for (const candidate of candidates) {
    const signature =
      candidate.rootCauseSignature ??
      `${candidate.issueType}:${candidate.element?.selector ?? "unknown"}`;
    const existing = groups.get(signature) ?? [];
    existing.push(candidate);
    groups.set(signature, existing);
  }

  const result: DeduplicatedCandidate[] = [];
  for (const [, group] of groups) {
    const representative = group.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
    result.push({ candidate: representative, affectedElementCount: group.length });
  }

  return result;
}
