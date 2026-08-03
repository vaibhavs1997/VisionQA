import { describe, it, expect } from "vitest";
import { imageAspectRatioDistortedDetector } from "../image/image-aspect-ratio-distorted.detector";
import { makePageContext, makeImage } from "./fixtures";

describe("imageAspectRatioDistortedDetector", () => {
  it("flags an image stretched well past the distortion threshold", () => {
    const ctx = makePageContext({
      images: [makeImage({ naturalWidth: 300, naturalHeight: 200, boundingBox: { x: 0, y: 0, width: 600, height: 200 } })],
    });
    const issues = imageAspectRatioDistortedDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("image-aspect-ratio-distorted");
  });

  it("does NOT flag an image rendered at its natural aspect ratio (scaled proportionally)", () => {
    const ctx = makePageContext({
      images: [makeImage({ naturalWidth: 1200, naturalHeight: 800, boundingBox: { x: 0, y: 0, width: 300, height: 200 } })],
    });
    expect(imageAspectRatioDistortedDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag minor deviation within normal rounding", () => {
    const ctx = makePageContext({
      images: [makeImage({ naturalWidth: 300, naturalHeight: 200, boundingBox: { x: 0, y: 0, width: 302, height: 198 } })],
    });
    expect(imageAspectRatioDistortedDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a broken/incomplete image (that's broken-image-v1's job)", () => {
    const ctx = makePageContext({
      images: [makeImage({ complete: false, naturalWidth: 0, naturalHeight: 0 })],
    });
    expect(imageAspectRatioDistortedDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag tiny icons where rounding dominates", () => {
    const ctx = makePageContext({
      images: [makeImage({ naturalWidth: 16, naturalHeight: 16, boundingBox: { x: 0, y: 0, width: 18, height: 10 } })],
    });
    expect(imageAspectRatioDistortedDetector.run(ctx)).toHaveLength(0);
  });
});
