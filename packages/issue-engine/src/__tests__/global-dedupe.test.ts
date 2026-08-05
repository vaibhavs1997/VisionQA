import { describe, expect, it } from "vitest";
import { deduplicateViewportInvariantIssues } from "../global-dedupe";
import { UiIssue } from "@ui-quality/shared";

function issue(partial: Partial<UiIssue> & { issueType: string; viewportName: string }): UiIssue {
  const { issueType, viewportName, ...rest } = partial;
  return {
    issueId: `id-${viewportName}-${issueType}`,
    scanId: "s1",
    pageId: "p1",
    category: rest.category ?? "seo",
    issueType,
    title: "t",
    description: "d",
    severity: "low",
    confidence: 0.9,
    url: "https://example.com",
    viewport: { name: viewportName, width: 390, height: 844 },
    evidence: {},
    detector: { id: "x", version: "1", source: "deterministic" },
    rootCauseSignature: rest.rootCauseSignature ?? issueType,
    affectedElementCount: 1,
    createdAt: new Date().toISOString(),
    browser: { engine: "chromium" },
    ...rest,
  } as UiIssue;
}

describe("deduplicateViewportInvariantIssues", () => {
  it("keeps one SEO issue across mobile and desktop", () => {
    const issues = [
      issue({ issueType: "meta-description-missing", viewportName: "mobile", category: "seo" }),
      issue({ issueType: "meta-description-missing", viewportName: "desktop", category: "seo" }),
      issue({ issueType: "horizontal-overflow", viewportName: "mobile", category: "layout" }),
      issue({ issueType: "horizontal-overflow", viewportName: "desktop", category: "layout" }),
    ];
    const out = deduplicateViewportInvariantIssues(issues);
    expect(out.filter((i) => i.issueType === "meta-description-missing")).toHaveLength(1);
    expect(out.filter((i) => i.issueType === "horizontal-overflow")).toHaveLength(2);
  });
});
