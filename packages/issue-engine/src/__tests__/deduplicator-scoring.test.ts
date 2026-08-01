import { describe, it, expect } from "vitest";
import { deduplicateCandidates } from "../deduplicator";
import { computeUiQualityScore } from "../scoring";
import { IssueCandidate } from "@ui-quality/shared";

function candidate(overrides: Partial<IssueCandidate>): IssueCandidate {
  return {
    category: "image",
    issueType: "broken-image-network-error",
    title: "t",
    description: "d",
    severity: "critical",
    confidence: 1.0,
    evidence: {},
    detector: { id: "d", version: "1.0.0", source: "deterministic" },
    ...overrides,
  };
}

describe("deduplicateCandidates", () => {
  it("groups candidates sharing a rootCauseSignature and counts affected elements", () => {
    const result = deduplicateCandidates([
      candidate({ rootCauseSignature: "broken-image:same-url" }),
      candidate({ rootCauseSignature: "broken-image:same-url" }),
      candidate({ rootCauseSignature: "broken-image:same-url" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].affectedElementCount).toBe(3);
  });

  it("keeps distinct signatures as separate issues", () => {
    const result = deduplicateCandidates([
      candidate({ rootCauseSignature: "a" }),
      candidate({ rootCauseSignature: "b" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("falls back to issueType+selector when rootCauseSignature is absent", () => {
    const result = deduplicateCandidates([
      candidate({ rootCauseSignature: undefined, element: { selector: "#x" } }),
      candidate({ rootCauseSignature: undefined, element: { selector: "#x" } }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].affectedElementCount).toBe(2);
  });

  it("keeps the highest-confidence candidate as the representative", () => {
    const result = deduplicateCandidates([
      candidate({ rootCauseSignature: "x", confidence: 0.6 }),
      candidate({ rootCauseSignature: "x", confidence: 0.95 }),
    ]);
    expect(result[0].candidate.confidence).toBe(0.95);
  });
});

describe("computeUiQualityScore", () => {
  it("returns 100 with no issues", () => {
    const { score } = computeUiQualityScore([]);
    expect(score).toBe(100);
  });

  it("deducts more for critical than for low severity", () => {
    const critical = computeUiQualityScore([
      { issue: { candidate: candidate({ severity: "critical" }), affectedElementCount: 1 }, viewportName: "desktop" },
    ]);
    const low = computeUiQualityScore([
      { issue: { candidate: candidate({ severity: "low" }), affectedElementCount: 1 }, viewportName: "desktop" },
    ]);
    expect(critical.score).toBeLessThan(low.score);
  });

  it("grows impact sub-linearly for issues affecting many elements, capped well below linear", () => {
    const oneElement = computeUiQualityScore([
      { issue: { candidate: candidate({}), affectedElementCount: 1 }, viewportName: "desktop" },
    ]);
    const tenElements = computeUiQualityScore([
      { issue: { candidate: candidate({}), affectedElementCount: 10 }, viewportName: "desktop" },
    ]);
    const hundredElements = computeUiQualityScore([
      { issue: { candidate: candidate({}), affectedElementCount: 100 }, viewportName: "desktop" },
    ]);
    // 10 affected elements is worse than 1 (more real damage)...
    expect(tenElements.totalWeightedImpact).toBeGreaterThan(oneElement.totalWeightedImpact);
    // ...but nowhere near 10x as bad — sub-linear growth, not linear.
    const impactRatio = tenElements.totalWeightedImpact / oneElement.totalWeightedImpact;
    expect(impactRatio).toBeLessThan(3);
    expect(impactRatio).toBeGreaterThan(1);
    // A root cause affecting many more elements (100 vs 10) still can't
    // dominate the score — the multiplier saturates at a hard ceiling.
    expect(hundredElements.totalWeightedImpact / tenElements.totalWeightedImpact).toBeLessThan(1.5);
  });

  it("never lets the score go below 0", () => {
    const manyCritical = Array.from({ length: 50 }, () => ({
      issue: { candidate: candidate({ severity: "critical", confidence: 1.0 }), affectedElementCount: 1 },
      viewportName: "desktop",
    }));
    const { score } = computeUiQualityScore(manyCritical);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
