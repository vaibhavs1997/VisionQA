import { describe, it, expect } from "vitest";
import { applyResponsiveDelta } from "../responsive-delta";
import { UiIssue } from "@ui-quality/shared";

function makeIssue(overrides: Partial<UiIssue> = {}): UiIssue {
  return {
    category: "layout",
    issueType: "horizontal-overflow",
    title: "t",
    description: "d",
    severity: "medium",
    confidence: 0.9,
    evidence: {},
    detector: { id: "d", version: "1.0.0", source: "deterministic" },
    issueId: "iss_1",
    scanId: "scan_1",
    pageId: "page_1",
    url: "https://example.test/",
    viewport: { name: "desktop", width: 1440, height: 900 },
    browser: { engine: "chromium" },
    affectedElementCount: 1,
    createdAt: new Date().toISOString(),
    rootCauseSignature: "horizontal-overflow:.banner",
    ...overrides,
  };
}

describe("applyResponsiveDelta", () => {
  it("tags an issue found only on mobile as narrow-viewport-only", () => {
    const issues = [makeIssue({ viewport: { name: "mobile", width: 390, height: 844 } })];
    const result = applyResponsiveDelta(issues, ["desktop", "mobile"]);
    expect(result[0].responsiveRecurrence?.narrowViewportOnly).toBe(true);
    expect(result[0].responsiveRecurrence?.viewportsAffected).toEqual(["mobile"]);
  });

  it("does NOT tag as narrow-viewport-only when it also appears on desktop", () => {
    const issues = [
      makeIssue({ viewport: { name: "desktop", width: 1440, height: 900 } }),
      makeIssue({ viewport: { name: "mobile", width: 390, height: 844 } }),
    ];
    const result = applyResponsiveDelta(issues, ["desktop", "mobile"]);
    expect(result.every((i) => i.responsiveRecurrence?.narrowViewportOnly === false)).toBe(true);
  });

  it("escalates severity by one step when the same root cause recurs across 2+ viewports", () => {
    const issues = [
      makeIssue({ severity: "medium", viewport: { name: "desktop", width: 1440, height: 900 } }),
      makeIssue({ severity: "medium", viewport: { name: "mobile", width: 390, height: 844 } }),
    ];
    const result = applyResponsiveDelta(issues, ["desktop", "mobile"]);
    expect(result.every((i) => i.severity === "high")).toBe(true);
  });

  it("does NOT escalate severity for an issue appearing in only one viewport", () => {
    const issues = [makeIssue({ severity: "medium" })];
    const result = applyResponsiveDelta(issues, ["desktop", "mobile"]);
    expect(result[0].severity).toBe("medium");
  });

  it("never escalates past 'high' — critical stays a detector-only designation", () => {
    const issues = [
      makeIssue({ severity: "high", viewport: { name: "desktop", width: 1440, height: 900 } }),
      makeIssue({ severity: "high", viewport: { name: "mobile", width: 390, height: 844 } }),
    ];
    const result = applyResponsiveDelta(issues, ["desktop", "mobile"]);
    expect(result.every((i) => i.severity === "high")).toBe(true);
  });

  it("keeps distinct root causes in separate groups", () => {
    const issues = [
      makeIssue({ rootCauseSignature: "a", viewport: { name: "desktop", width: 1440, height: 900 } }),
      makeIssue({ rootCauseSignature: "b", viewport: { name: "mobile", width: 390, height: 844 } }),
    ];
    const result = applyResponsiveDelta(issues, ["desktop", "mobile"]);
    expect(result.find((i) => i.rootCauseSignature === "a")?.responsiveRecurrence?.viewportsAffected).toEqual([
      "desktop",
    ]);
    expect(result.find((i) => i.rootCauseSignature === "b")?.responsiveRecurrence?.viewportsAffected).toEqual([
      "mobile",
    ]);
  });
});
