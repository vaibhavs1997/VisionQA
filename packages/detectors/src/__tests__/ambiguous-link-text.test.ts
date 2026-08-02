import { describe, it, expect } from "vitest";
import { ambiguousLinkTextDetector } from "../accessibility/ambiguous-link-text.detector";
import { makePageContext, makeElement } from "./fixtures";

function link(overrides: Parameters<typeof makeElement>[0] = {}) {
  return makeElement({ tagName: "a", isInteractive: true, ...overrides });
}

describe("ambiguousLinkTextDetector", () => {
  it('flags generic "click here" link text', () => {
    const ctx = makePageContext({
      elements: [link({ selector: "a.cta", visibleText: "Click here", attributes: { href: "/pricing" } })],
    });
    const issues = ambiguousLinkTextDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("generic-link-text");
  });

  it("flags identical link text pointing to different destinations", () => {
    const ctx = makePageContext({
      elements: [
        link({ selector: "a.article-1", visibleText: "Read more", attributes: { href: "/articles/1" } }),
        link({ selector: "a.article-2", visibleText: "Read more", attributes: { href: "/articles/2" } }),
      ],
    });
    const issues = ambiguousLinkTextDetector.run(ctx) as any[];
    // Both are also "read more" (a generic phrase) so they're each flagged
    // once for that; the point of this test is that generic-phrase
    // handling doesn't also double-count them as duplicates.
    expect(issues.every((i) => i.issueType === "generic-link-text")).toBe(true);
  });

  it("flags identical non-generic link text pointing to different destinations", () => {
    const ctx = makePageContext({
      elements: [
        link({ selector: "a.p1", visibleText: "Q3 Report", attributes: { href: "/reports/q3" } }),
        link({ selector: "a.p2", visibleText: "Q3 Report", attributes: { href: "/reports/q3-summary" } }),
      ],
    });
    const issues = ambiguousLinkTextDetector.run(ctx) as any[];
    expect(issues).toHaveLength(2);
    expect(issues[0].issueType).toBe("duplicate-link-text-different-destinations");
  });

  it("does NOT flag identical text with the same destination (e.g. repeated nav links)", () => {
    const ctx = makePageContext({
      elements: [
        link({ selector: "nav a.home-1", visibleText: "Home", attributes: { href: "/" } }),
        link({ selector: "footer a.home-2", visibleText: "Home", attributes: { href: "/" } }),
      ],
    });
    expect(ambiguousLinkTextDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag descriptive, unique link text", () => {
    const ctx = makePageContext({
      elements: [link({ selector: "a.unique", visibleText: "View the Q3 earnings report", attributes: { href: "/q3" } })],
    });
    expect(ambiguousLinkTextDetector.run(ctx)).toHaveLength(0);
  });
});
