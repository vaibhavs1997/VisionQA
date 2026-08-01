import { describe, it, expect } from "vitest";
import { brokenImageDetector } from "../image/broken-image.detector";
import { makePageContext, makeImage } from "./fixtures";

describe("brokenImageDetector", () => {
  it("flags an image with a 404 network status as critical, confidence 1.0", () => {
    const ctx = makePageContext({
      images: [makeImage({ src: "/missing.jpg", currentSrc: "/missing.jpg", resourceStatus: 404 })],
    });
    const results = brokenImageDetector.run(ctx) as ReturnType<typeof brokenImageDetector.run>;
    const issues = Array.isArray(results) ? results : [];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("broken-image-network-error");
    expect(issues[0].confidence).toBe(1.0);
    expect(issues[0].severity).toBe("critical");
  });

  it("flags a completed image with zero natural dimensions", () => {
    const ctx = makePageContext({
      images: [makeImage({ src: "/corrupt.png", complete: true, naturalWidth: 0, naturalHeight: 0 })],
    });
    const issues = brokenImageDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("broken-image-zero-dimensions");
    expect(issues[0].confidence).toBe(0.95);
  });

  it("flags a visible image with no src at all", () => {
    const ctx = makePageContext({
      images: [makeImage({ src: undefined, currentSrc: undefined })],
    });
    const issues = brokenImageDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("broken-image-empty-src");
  });

  it("does NOT flag a healthy, fully-loaded image", () => {
    const ctx = makePageContext({
      images: [makeImage({ src: "/hero.jpg", currentSrc: "/hero.jpg", complete: true, naturalWidth: 800, naturalHeight: 400 })],
    });
    const issues = brokenImageDetector.run(ctx) as any[];
    expect(issues).toHaveLength(0);
  });

  it("does NOT flag an invisible (display:none) broken image", () => {
    const ctx = makePageContext({
      images: [makeImage({ src: "/missing.jpg", resourceStatus: 404, isVisible: false })],
    });
    const issues = brokenImageDetector.run(ctx) as any[];
    expect(issues).toHaveLength(0);
  });

  it("lowers severity for small (likely decorative) broken images", () => {
    const ctx = makePageContext({
      images: [
        makeImage({
          src: "/icon.svg",
          resourceStatus: 404,
          boundingBox: { x: 0, y: 0, width: 16, height: 16 },
        }),
      ],
    });
    const issues = brokenImageDetector.run(ctx) as any[];
    expect(issues[0].severity).toBe("medium");
  });
});
