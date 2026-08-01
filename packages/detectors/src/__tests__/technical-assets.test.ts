import { describe, it, expect } from "vitest";
import { fontLoadFailureDetector } from "../technical/font-load-failure.detector";
import { brokenSvgIconDetector } from "../technical/broken-svg-icon.detector";
import { makePageContext, makeFont, makeSvg } from "./fixtures";

describe("fontLoadFailureDetector", () => {
  it("flags a font with status=error", () => {
    const ctx = makePageContext({ fonts: [makeFont({ family: "Brand Sans", status: "error" })] });
    const issues = fontLoadFailureDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].evidence.measuredValue).toContain("Brand Sans");
  });

  it("does NOT flag a successfully loaded font", () => {
    const ctx = makePageContext({ fonts: [makeFont({ status: "loaded" })] });
    expect(fontLoadFailureDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a font still loading/unloaded (not yet triggered by rendered text)", () => {
    const ctx = makePageContext({ fonts: [makeFont({ status: "unloaded" }), makeFont({ status: "loading" })] });
    expect(fontLoadFailureDetector.run(ctx)).toHaveLength(0);
  });

  it("deduplicates repeated failures of the same family (e.g. multiple weights)", () => {
    const ctx = makePageContext({
      fonts: [makeFont({ family: "Brand Sans", status: "error" }), makeFont({ family: "Brand Sans", status: "error" })],
    });
    expect(fontLoadFailureDetector.run(ctx)).toHaveLength(1);
  });
});

describe("brokenSvgIconDetector", () => {
  it("flags a meaningfully-sized visible SVG with no rendered shape", () => {
    const ctx = makePageContext({
      svgs: [makeSvg({ hasVisibleShape: false, role: "img", ariaLabel: "Settings icon" })],
    });
    const issues = brokenSvgIconDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].confidence).toBe(0.85);
  });

  it("does NOT flag an SVG that renders a real shape", () => {
    const ctx = makePageContext({ svgs: [makeSvg({ hasVisibleShape: true })] });
    expect(brokenSvgIconDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag an aria-hidden decorative SVG", () => {
    const ctx = makePageContext({ svgs: [makeSvg({ hasVisibleShape: false, ariaHidden: true })] });
    expect(brokenSvgIconDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a tiny SVG below the area floor", () => {
    const ctx = makePageContext({
      svgs: [makeSvg({ hasVisibleShape: false, boundingBox: { x: 0, y: 0, width: 2, height: 2 } })],
    });
    expect(brokenSvgIconDetector.run(ctx)).toHaveLength(0);
  });

  it("lowers confidence for likely icon-font sprite references", () => {
    const ctx = makePageContext({
      svgs: [makeSvg({ hasVisibleShape: false, isLikelyIconFont: true })],
    });
    const issues = brokenSvgIconDetector.run(ctx) as any[];
    expect(issues[0].confidence).toBe(0.6);
  });
});
