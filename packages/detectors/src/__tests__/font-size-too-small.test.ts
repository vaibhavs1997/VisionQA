import { describe, it, expect } from "vitest";
import { fontSizeTooSmallDetector } from "../accessibility/font-size-too-small.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("fontSizeTooSmallDetector", () => {
  it("flags visible text rendered at 8px", () => {
    const ctx = makePageContext({
      elements: [makeElement({ visibleText: "Fine print disclaimer text", computedStyle: { fontSize: "8px" } as any })],
    });
    const issues = fontSizeTooSmallDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("medium"); // under 9px
  });

  it("flags 10px at low severity", () => {
    const ctx = makePageContext({
      elements: [makeElement({ visibleText: "Some readable-ish text", computedStyle: { fontSize: "10px" } as any })],
    });
    const issues = fontSizeTooSmallDetector.run(ctx) as any[];
    expect(issues[0].severity).toBe("low");
  });

  it("does NOT flag 16px body text", () => {
    const ctx = makePageContext({
      elements: [makeElement({ visibleText: "Normal readable paragraph text", computedStyle: { fontSize: "16px" } as any })],
    });
    expect(fontSizeTooSmallDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag short/trivial text (e.g. a single icon glyph character)", () => {
    const ctx = makePageContext({
      elements: [makeElement({ visibleText: "×", computedStyle: { fontSize: "8px" } as any })],
    });
    expect(fontSizeTooSmallDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag invisible elements", () => {
    const ctx = makePageContext({
      elements: [makeElement({ visibleText: "Hidden small text here", isVisible: false, computedStyle: { fontSize: "8px" } as any })],
    });
    expect(fontSizeTooSmallDetector.run(ctx)).toHaveLength(0);
  });
});
