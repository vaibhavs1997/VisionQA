import { describe, it, expect } from "vitest";
import { validateCandidates } from "../validator";
import { IssueCandidate } from "@ui-quality/shared";

function candidate(overrides: Partial<IssueCandidate>): IssueCandidate {
  return {
    category: "layout",
    issueType: "test-issue",
    title: "t",
    description: "d",
    severity: "medium",
    confidence: 0.9,
    evidence: {},
    detector: { id: "test-detector", version: "1.0.0", source: "deterministic" },
    ...overrides,
  };
}

describe("validateCandidates", () => {
  it("accepts a candidate above the category threshold", () => {
    const { accepted, suppressed } = validateCandidates([candidate({ category: "image", confidence: 0.9 })]);
    expect(accepted).toHaveLength(1);
    expect(suppressed).toHaveLength(0);
  });

  it("suppresses a candidate below the category threshold", () => {
    const { accepted, suppressed } = validateCandidates([candidate({ category: "layout", confidence: 0.3 })]);
    expect(accepted).toHaveLength(0);
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0].reason).toContain("below threshold");
  });

  it("applies a stricter threshold to layout than to content", () => {
    // layout threshold is 0.7, content threshold is 0.5 — a 0.6 confidence
    // candidate should be suppressed for layout but accepted for content.
    const result = validateCandidates([
      candidate({ category: "layout", confidence: 0.6, issueType: "a" }),
      candidate({ category: "content", confidence: 0.6, issueType: "b" }),
    ]);
    expect(result.accepted.map((c) => c.issueType)).toEqual(["b"]);
  });
});
