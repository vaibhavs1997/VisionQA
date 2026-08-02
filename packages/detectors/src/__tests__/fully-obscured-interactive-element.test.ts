import { describe, it, expect } from "vitest";
import { fullyObscuredInteractiveElementDetector } from "../layout/fully-obscured-interactive-element.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("fullyObscuredInteractiveElementDetector", () => {
  it("flags a button fully covered by a later, higher z-indexed sibling", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({
          selector: "button.submit",
          tagName: "button",
          isInteractive: true,
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
          computedStyle: { zIndex: "1" } as any,
        }),
        makeElement({
          selector: "div.overlay",
          tagName: "div",
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
          computedStyle: { zIndex: "5" } as any,
        }),
      ],
    });
    const issues = fullyObscuredInteractiveElementDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("fully-obscured-interactive-element");
    expect(issues[0].severity).toBe("critical");
  });

  it("does NOT flag a partially (not near-fully) covered element", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({
          selector: "button.submit",
          tagName: "button",
          isInteractive: true,
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
        }),
        makeElement({
          selector: "div.badge",
          tagName: "div",
          boundingBox: { x: 80, y: 0, width: 40, height: 40 },
          computedStyle: { zIndex: "5" } as any,
        }),
      ],
    });
    expect(fullyObscuredInteractiveElementDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag ancestor/descendant pairs", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({
          selector: "div.card",
          tagName: "div",
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
        }),
        makeElement({
          selector: "div.card > button",
          tagName: "button",
          isInteractive: true,
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
        }),
      ],
    });
    expect(fullyObscuredInteractiveElementDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag when the covering element is mostly transparent", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({
          selector: "button.submit",
          tagName: "button",
          isInteractive: true,
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
        }),
        makeElement({
          selector: "div.ghost",
          tagName: "div",
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
          computedStyle: { zIndex: "5", opacity: "0.1" } as any,
        }),
      ],
    });
    expect(fullyObscuredInteractiveElementDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag when the covering element is earlier in DOM order with no higher z-index (likely underneath, not on top)", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({
          selector: "div.background",
          tagName: "div",
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
        }),
        makeElement({
          selector: "button.submit",
          tagName: "button",
          isInteractive: true,
          boundingBox: { x: 0, y: 0, width: 100, height: 40 },
        }),
      ],
    });
    expect(fullyObscuredInteractiveElementDetector.run(ctx)).toHaveLength(0);
  });
});
