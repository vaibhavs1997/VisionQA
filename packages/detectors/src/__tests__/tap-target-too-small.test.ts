import { describe, it, expect } from "vitest";
import { tapTargetTooSmallDetector } from "../accessibility/tap-target-too-small.detector";
import { makePageContext, makeElement } from "./fixtures";

function mobileContext(overrides: Parameters<typeof makePageContext>[0] = {}) {
  return makePageContext({
    scan: {
      scanId: "scan_test",
      requestedUrl: "https://example.test/",
      startedAt: new Date().toISOString(),
      browser: "chromium",
      viewport: { name: "mobile", width: 390, height: 844 },
      userAgent: "test-agent",
    },
    ...overrides,
  });
}

describe("tapTargetTooSmallDetector", () => {
  it("flags an 18x18 interactive element on a mobile viewport", () => {
    const ctx = mobileContext({
      elements: [makeElement({ isInteractive: true, boundingBox: { x: 0, y: 0, width: 18, height: 18 } })],
    });
    const issues = tapTargetTooSmallDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("tap-target-too-small");
  });

  it("does NOT flag on a desktop viewport", () => {
    const ctx = makePageContext({
      elements: [makeElement({ isInteractive: true, boundingBox: { x: 0, y: 0, width: 18, height: 18 } })],
    });
    expect(tapTargetTooSmallDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a 44x44 target on mobile", () => {
    const ctx = mobileContext({
      elements: [makeElement({ isInteractive: true, boundingBox: { x: 0, y: 0, width: 44, height: 44 } })],
    });
    expect(tapTargetTooSmallDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a full-width short row (only one axis is small)", () => {
    const ctx = mobileContext({
      elements: [makeElement({ isInteractive: true, boundingBox: { x: 0, y: 0, width: 390, height: 18 } })],
    });
    expect(tapTargetTooSmallDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag non-interactive elements", () => {
    const ctx = mobileContext({
      elements: [makeElement({ isInteractive: false, boundingBox: { x: 0, y: 0, width: 10, height: 10 } })],
    });
    expect(tapTargetTooSmallDetector.run(ctx)).toHaveLength(0);
  });
});
