import { describe, it, expect } from "vitest";
import { horizontalOverflowDetector } from "../layout/horizontal-overflow.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("horizontalOverflowDetector", () => {
  it("does NOT flag a page with no horizontal scroll", () => {
    const ctx = makePageContext({
      page: {
        finalUrl: "https://example.test/",
        title: "t",
        loadState: "loaded",
        documentWidth: 1440,
        documentHeight: 900,
        viewportWidth: 1440,
        viewportHeight: 900,
        scrollWidth: 1440,
        scrollHeight: 900,
        hasHorizontalScroll: false,
      },
    });
    expect(horizontalOverflowDetector.run(ctx)).toHaveLength(0);
  });

  it("ignores sub-threshold overflow (noise)", () => {
    const ctx = makePageContext({
      page: {
        finalUrl: "https://example.test/",
        title: "t",
        loadState: "loaded",
        documentWidth: 1445,
        documentHeight: 900,
        viewportWidth: 1440,
        viewportHeight: 900,
        scrollWidth: 1445, // 5px over — below the 8px ignore threshold
        scrollHeight: 900,
        hasHorizontalScroll: true,
      },
    });
    expect(horizontalOverflowDetector.run(ctx)).toHaveLength(0);
  });

  it("flags real overflow and identifies the culprit element, high confidence above 24px", () => {
    const culprit = makeElement({
      selector: ".promo-banner",
      boundingBox: { x: 0, y: 0, width: 1200, height: 100 },
    });
    const ctx = makePageContext({
      page: {
        finalUrl: "https://example.test/",
        title: "t",
        loadState: "loaded",
        documentWidth: 1200,
        documentHeight: 900,
        viewportWidth: 390,
        viewportHeight: 844,
        scrollWidth: 1200,
        scrollHeight: 900,
        hasHorizontalScroll: true,
      },
      elements: [culprit],
    });
    const issues = horizontalOverflowDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].confidence).toBe(1.0);
    expect(issues[0].element.selector).toBe(".promo-banner");
    expect(issues[0].severity).toBe("high"); // mobile viewport, overflow > 48px
  });

  it("excludes intentional horizontal scroll containers from culprit selection", () => {
    const carousel = makeElement({
      selector: ".carousel",
      boundingBox: { x: 0, y: 0, width: 1600, height: 100 },
      computedStyle: { overflowX: "auto" } as any,
    });
    const ctx = makePageContext({
      page: {
        finalUrl: "https://example.test/",
        title: "t",
        loadState: "loaded",
        documentWidth: 1600,
        documentHeight: 900,
        viewportWidth: 1440,
        viewportHeight: 900,
        scrollWidth: 1600,
        scrollHeight: 900,
        hasHorizontalScroll: true,
      },
      elements: [carousel],
    });
    const issues = horizontalOverflowDetector.run(ctx) as any[];
    // Page-level overflow is still real and gets reported, but the
    // carousel itself must not be identified as the culprit.
    expect(issues).toHaveLength(1);
    expect(issues[0].element).toBeUndefined();
  });
});
