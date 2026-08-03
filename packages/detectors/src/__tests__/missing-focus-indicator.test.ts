import { describe, it, expect } from "vitest";
import { missingFocusIndicatorDetector } from "../accessibility/missing-focus-indicator.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("missingFocusIndicatorDetector", () => {
  it("flags an interactive element whose focus check came back false", () => {
    const el = makeElement({ tagName: "button", selector: "button.cta", isInteractive: true });
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
        focusIndicatorChecks: [{ selector: "button.cta", hasVisibleFocusIndicator: false }],
      } as any,
    });
    const issues = missingFocusIndicatorDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("missing-focus-indicator");
    expect(issues[0].severity).toBe("critical");
  });

  it("does NOT flag an element whose focus check came back true", () => {
    const el = makeElement({ tagName: "button", selector: "button.cta", isInteractive: true });
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
        focusIndicatorChecks: [{ selector: "button.cta", hasVisibleFocusIndicator: true }],
      } as any,
    });
    expect(missingFocusIndicatorDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag anything when focusIndicatorChecks is absent (interaction pass wasn't run, e.g. non-desktop viewport)", () => {
    const ctx = makePageContext({ elements: [makeElement({ tagName: "button", isInteractive: true })] });
    expect(missingFocusIndicatorDetector.run(ctx)).toHaveLength(0);
  });
});
