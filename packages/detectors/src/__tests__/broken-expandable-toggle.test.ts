import { describe, it, expect } from "vitest";
import { brokenExpandableToggleDetector } from "../technical/broken-expandable-toggle.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("brokenExpandableToggleDetector", () => {
  it("flags a toggle whose check came back false", () => {
    const el = makeElement({ selector: "button.menu-toggle", attributes: { "aria-expanded": "false", "aria-controls": "menu-panel" } });
    const ctx = makePageContext({
      elements: [el],
      page: {
        finalUrl: "https://example.test/",
        title: "",
        loadState: "loaded",
        documentWidth: 1280,
        documentHeight: 800,
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollWidth: 1280,
        scrollHeight: 800,
        hasHorizontalScroll: false,
        expandableToggleChecks: [{ selector: "button.menu-toggle", toggledCorrectly: false, ariaControlsSelector: "#menu-panel" }],
      } as any,
    });
    const issues = brokenExpandableToggleDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("broken-expandable-toggle");
    expect(issues[0].severity).toBe("high");
  });

  it("does NOT flag a toggle that worked correctly", () => {
    const el = makeElement({ selector: "button.menu-toggle", attributes: { "aria-expanded": "false" } });
    const ctx = makePageContext({
      elements: [el],
      page: {
        finalUrl: "https://example.test/",
        title: "",
        loadState: "loaded",
        documentWidth: 1280,
        documentHeight: 800,
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollWidth: 1280,
        scrollHeight: 800,
        hasHorizontalScroll: false,
        expandableToggleChecks: [{ selector: "button.menu-toggle", toggledCorrectly: true }],
      } as any,
    });
    expect(brokenExpandableToggleDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag anything when expandableToggleChecks is absent", () => {
    const ctx = makePageContext({ elements: [makeElement({ attributes: { "aria-expanded": "false" } })] });
    expect(brokenExpandableToggleDetector.run(ctx)).toHaveLength(0);
  });
});
