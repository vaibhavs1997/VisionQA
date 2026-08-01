import { describe, it, expect } from "vitest";
import { elementOutsideViewportDetector } from "../layout/element-outside-viewport.detector";
import { textClippingDetector } from "../layout/text-clipping.detector";
import { textOverflowDetector } from "../layout/text-overflow.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("elementOutsideViewportDetector", () => {
  it("flags an interactive element positioned fully outside the viewport", () => {
    const el = makeElement({
      tagName: "button",
      isInteractive: true,
      visibleText: "Submit",
      boundingBox: { x: 2000, y: 100, width: 100, height: 40 },
      viewportIntersection: 0,
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = elementOutsideViewportDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high");
  });

  it("does NOT flag an element that has any viewport intersection", () => {
    const el = makeElement({ boundingBox: { x: 0, y: 0, width: 100, height: 40 }, viewportIntersection: 0.3 });
    const ctx = makePageContext({ elements: [el] });
    expect(elementOutsideViewportDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag an intentional off-canvas drawer using a CSS transform", () => {
    const el = makeElement({
      tagName: "nav",
      hasMeaningfulChildContent: true,
      boundingBox: { x: -300, y: 0, width: 300, height: 600 },
      viewportIntersection: 0,
      computedStyle: { transform: "translateX(-300px)" } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    expect(elementOutsideViewportDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag an offscreen element with no meaningful content and not interactive", () => {
    const el = makeElement({
      hasMeaningfulChildContent: false,
      isInteractive: false,
      boundingBox: { x: 3000, y: 0, width: 10, height: 10 },
      viewportIntersection: 0,
    });
    const ctx = makePageContext({ elements: [el] });
    expect(elementOutsideViewportDetector.run(ctx)).toHaveLength(0);
  });
});

describe("textClippingDetector", () => {
  it("flags overflow:hidden content with no ellipsis/line-clamp", () => {
    const el = makeElement({
      visibleText: "Some long heading text that gets cut off",
      computedStyle: { overflowY: "hidden", textOverflow: "clip", webkitLineClamp: "none" } as any,
      layoutMetrics: { clientHeight: 40, scrollHeight: 70, clientWidth: 200, scrollWidth: 200 } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = textClippingDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high");
  });

  it("does NOT flag intentional ellipsis truncation", () => {
    const el = makeElement({
      visibleText: "Some long heading text",
      computedStyle: { overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as any,
      layoutMetrics: { clientWidth: 100, scrollWidth: 250, clientHeight: 20, scrollHeight: 20 } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    expect(textClippingDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag intentional -webkit-line-clamp truncation", () => {
    const el = makeElement({
      visibleText: "A long paragraph that spans several lines of body copy",
      computedStyle: { overflowY: "hidden", webkitLineClamp: "3" } as any,
      layoutMetrics: { clientHeight: 60, scrollHeight: 120, clientWidth: 300, scrollWidth: 300 } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    expect(textClippingDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag an element with no overflow at all", () => {
    const el = makeElement({
      visibleText: "Fits fine",
      computedStyle: { overflowY: "hidden" } as any,
      layoutMetrics: { clientHeight: 40, scrollHeight: 40, clientWidth: 100, scrollWidth: 100 } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    expect(textClippingDetector.run(ctx)).toHaveLength(0);
  });
});

describe("textOverflowDetector", () => {
  it("flags nowrap content escaping its box with visible overflow", () => {
    const el = makeElement({
      visibleText: "a-very-long-unbroken-sku-code-1234567890",
      computedStyle: { overflowX: "visible", whiteSpace: "nowrap" } as any,
      layoutMetrics: { clientWidth: 100, scrollWidth: 180, clientHeight: 20, scrollHeight: 20 } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = textOverflowDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
  });

  it("does NOT flag when overflow is hidden (that's text-clipping's job)", () => {
    const el = makeElement({
      visibleText: "long-sku-code",
      computedStyle: { overflowX: "hidden", whiteSpace: "nowrap" } as any,
      layoutMetrics: { clientWidth: 100, scrollWidth: 180 } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    expect(textOverflowDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag wrapping text", () => {
    const el = makeElement({
      visibleText: "normal wrapping paragraph text",
      computedStyle: { overflowX: "visible", whiteSpace: "normal" } as any,
      layoutMetrics: { clientWidth: 100, scrollWidth: 100 } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    expect(textOverflowDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag negligible overflow (noise floor)", () => {
    const el = makeElement({
      visibleText: "almost fits",
      computedStyle: { overflowX: "visible", whiteSpace: "nowrap" } as any,
      layoutMetrics: { clientWidth: 100, scrollWidth: 102 } as any,
    });
    const ctx = makePageContext({ elements: [el] });
    expect(textOverflowDetector.run(ctx)).toHaveLength(0);
  });
});
