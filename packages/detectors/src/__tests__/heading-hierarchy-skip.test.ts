import { describe, it, expect } from "vitest";
import { headingHierarchySkipDetector } from "../accessibility/heading-hierarchy-skip.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("headingHierarchySkipDetector", () => {
  it("flags a level skip from h2 to h4", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ tagName: "h1", selector: "h1", visibleText: "Title" }),
        makeElement({ tagName: "h2", selector: "h2", visibleText: "Section" }),
        makeElement({ tagName: "h4", selector: "h4", visibleText: "Subsection" }),
      ],
    });
    const issues = headingHierarchySkipDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("heading-level-skip");
    expect(issues[0].evidence.measuredValue).toBe("h2 → h4");
  });

  it("does NOT flag a well-formed sequential hierarchy", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ tagName: "h1", selector: "h1" }),
        makeElement({ tagName: "h2", selector: "h2" }),
        makeElement({ tagName: "h3", selector: "h3" }),
        makeElement({ tagName: "h2", selector: "h2-2" }),
      ],
    });
    expect(headingHierarchySkipDetector.run(ctx)).toHaveLength(0);
  });

  it("flags multiple h1 elements", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ tagName: "h1", selector: "h1-a" }),
        makeElement({ tagName: "h1", selector: "h1-b" }),
      ],
    });
    const issues = headingHierarchySkipDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("multiple-h1-headings");
  });

  it("ignores invisible headings", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ tagName: "h1", selector: "h1", isVisible: true }),
        makeElement({ tagName: "h4", selector: "h4-hidden", isVisible: false }),
      ],
    });
    expect(headingHierarchySkipDetector.run(ctx)).toHaveLength(0);
  });
});
