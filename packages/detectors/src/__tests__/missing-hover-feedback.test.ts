import { describe, it, expect } from "vitest";
import { missingHoverFeedbackDetector } from "../content/missing-hover-feedback.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("missingHoverFeedbackDetector", () => {
  it("flags a link/button whose hover check came back false", () => {
    const el = makeElement({ tagName: "button", selector: "button.cta" });
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
        hoverFeedbackChecks: [{ selector: "button.cta", hasVisibleHoverFeedback: false }],
      } as any,
    });
    const issues = missingHoverFeedbackDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("missing-hover-feedback");
    expect(issues[0].severity).toBe("low");
  });

  it("does NOT flag an element whose hover check came back true", () => {
    const el = makeElement({ tagName: "button", selector: "button.cta" });
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
        hoverFeedbackChecks: [{ selector: "button.cta", hasVisibleHoverFeedback: true }],
      } as any,
    });
    expect(missingHoverFeedbackDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag anything when hoverFeedbackChecks is absent", () => {
    const ctx = makePageContext({ elements: [makeElement({ tagName: "button" })] });
    expect(missingHoverFeedbackDetector.run(ctx)).toHaveLength(0);
  });
});
