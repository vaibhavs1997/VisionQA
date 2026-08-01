import { describe, it, expect } from "vitest";
import { elementOverlapDetector } from "../layout/element-overlap.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("elementOverlapDetector", () => {
  it("flags two overlapping interactive elements with no overlay signal", () => {
    const a = makeElement({
      selector: ".btn-a",
      tagName: "button",
      isInteractive: true,
      boundingBox: { x: 0, y: 0, width: 100, height: 40 },
    });
    const b = makeElement({
      selector: ".btn-b",
      tagName: "button",
      isInteractive: true,
      boundingBox: { x: 50, y: 10, width: 100, height: 40 },
    });
    const ctx = makePageContext({ elements: [a, b] });
    const issues = elementOverlapDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high");
  });

  it("does NOT flag near-total containment (parent/child nesting)", () => {
    const parent = makeElement({
      selector: ".card",
      visibleText: "card wrapper",
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
    });
    const child = makeElement({
      selector: ".card-title",
      visibleText: "Title",
      boundingBox: { x: 10, y: 10, width: 280, height: 30 },
    });
    const ctx = makePageContext({ elements: [parent, child] });
    expect(elementOverlapDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag an element overlapping a known modal (role=dialog)", () => {
    const modal = makeElement({
      selector: ".modal",
      role: "dialog",
      visibleText: "Modal content",
      boundingBox: { x: 100, y: 100, width: 400, height: 300 },
    });
    const backgroundCard = makeElement({
      selector: ".background-card",
      visibleText: "Background content",
      boundingBox: { x: 150, y: 150, width: 200, height: 100 },
    });
    const ctx = makePageContext({ elements: [modal, backgroundCard] });
    expect(elementOverlapDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag elements with distinct z-index in a floating/fixed stacking context", () => {
    const tooltip = makeElement({
      selector: ".tooltip-custom",
      visibleText: "Tip text",
      boundingBox: { x: 100, y: 100, width: 150, height: 50 },
      computedStyle: { position: "absolute", zIndex: "50" } as any,
    });
    const content = makeElement({
      selector: ".content-below",
      visibleText: "Regular content",
      boundingBox: { x: 100, y: 100, width: 150, height: 50 },
      computedStyle: { position: "static", zIndex: "1" } as any,
    });
    const ctx = makePageContext({ elements: [tooltip, content] });
    expect(elementOverlapDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag tiny elements (borders/dividers) below the area floor", () => {
    const a = makeElement({ selector: ".divider-a", visibleText: "x", boundingBox: { x: 0, y: 0, width: 10, height: 2 } });
    const b = makeElement({ selector: ".divider-b", visibleText: "y", boundingBox: { x: 0, y: 0, width: 10, height: 2 } });
    const ctx = makePageContext({ elements: [a, b] });
    expect(elementOverlapDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag two non-overlapping elements", () => {
    const a = makeElement({ selector: ".a", visibleText: "a", boundingBox: { x: 0, y: 0, width: 100, height: 40 } });
    const b = makeElement({ selector: ".b", visibleText: "b", boundingBox: { x: 200, y: 200, width: 100, height: 40 } });
    const ctx = makePageContext({ elements: [a, b] });
    expect(elementOverlapDetector.run(ctx)).toHaveLength(0);
  });
});
