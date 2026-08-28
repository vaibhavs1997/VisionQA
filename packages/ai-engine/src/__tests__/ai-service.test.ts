import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { enhanceWithAi } from "../ai-service";
import { MockAiProvider } from "../providers/mock-provider";
import { AiCostTracker } from "../cost-tracker";
import { PageContext, IssueCandidate, ElementSnapshot } from "@ui-quality/shared";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-service-test-"));

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function makeScreenshot(): Promise<string> {
  const p = path.join(tmpDir, "page.png");
  await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .png()
    .toFile(p);
  return p;
}

function makeElement(overrides: Partial<ElementSnapshot>): ElementSnapshot {
  return {
    id: overrides.id ?? "el_a",
    selector: overrides.selector ?? "button.a",
    tagName: overrides.tagName ?? "button",
    attributes: {},
    boundingBox: overrides.boundingBox ?? { x: 10, y: 10, width: 100, height: 40 },
    viewportIntersection: 1,
    isVisible: true,
    isInteractive: true,
    computedStyle: {
      display: "block",
      visibility: "visible",
      opacity: "1",
      position: "static",
      overflowX: "visible",
      overflowY: "visible",
      zIndex: "auto",
      color: "rgb(0,0,0)",
      backgroundColor: "rgba(0,0,0,0)",
      backgroundImage: "none",
      fontFamily: "sans-serif",
      fontSize: "16px",
      fontWeight: "400",
      lineHeight: "24px",
      textOverflow: "clip",
      whiteSpace: "normal",
      webkitLineClamp: "none",
      transform: "none",
    },
    layoutMetrics: { clientWidth: 100, clientHeight: 40, scrollWidth: 100, scrollHeight: 40, offsetWidth: 100, offsetHeight: 40 },
    ...overrides,
  };
}

function makePageContext(elements: ElementSnapshot[]): PageContext {
  return {
    scan: {
      scanId: "scan_test",
      requestedUrl: "https://example.test/",
      startedAt: new Date().toISOString(),
      browser: "chromium",
      viewport: { name: "desktop", width: 1440, height: 900 },
      userAgent: "test",
    },
    page: {
      finalUrl: "https://example.test/",
      title: "Test Page",
      loadState: "loaded",
      documentWidth: 800,
      documentHeight: 600,
      viewportWidth: 800,
      viewportHeight: 600,
      scrollWidth: 800,
      scrollHeight: 600,
      hasHorizontalScroll: false,
    },
    elements,
    images: [],
    resources: [],
    consoleMessages: [],
    screenshots: [],
    fonts: [],
    svgs: [],
  };
}

function makeCandidate(overrides: Partial<IssueCandidate>): IssueCandidate {
  return {
    category: "layout",
    issueType: "element-overlap",
    title: "t",
    description: "d",
    severity: "medium",
    confidence: 0.65,
    evidence: {},
    detector: { id: "d", version: "1.0.0", source: "deterministic" },
    ...overrides,
  };
}

describe("enhanceWithAi", () => {
  it("passes through ineligible issue types completely untouched", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "img.hero" });
    const context = makePageContext([elA]);
    const candidate = makeCandidate({
      issueType: "broken-image-network-error",
      category: "image",
      element: { selector: "img.hero", boundingBox: elA.boundingBox! },
    });

    const tracker = new AiCostTracker();
    const result = await enhanceWithAi([candidate], context, {
      provider: new MockAiProvider(),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(result).toEqual([candidate]);
    expect(tracker.summarize().totalCalls).toBe(0);
  });

  it("confirms a high-overlap-ratio element-overlap candidate and attaches AI evidence", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "button.a", boundingBox: { x: 10, y: 10, width: 100, height: 40 } });
    const elB = makeElement({ id: "el_b", selector: "button.b", boundingBox: { x: 60, y: 15, width: 100, height: 40 } });
    const context = makePageContext([elA, elB]);

    const candidate = makeCandidate({
      element: { selector: "button.a", boundingBox: elA.boundingBox! },
      evidence: { measuredValue: "overlapRatio=0.75", raw: { otherSelector: "button.b" } },
    });

    const tracker = new AiCostTracker();
    const result = await enhanceWithAi([candidate], context, {
      provider: new MockAiProvider({ simulatedLatencyMs: 1 }),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(result).toHaveLength(1);
    expect(result[0].aiValidation?.decision).toBe("confirm");
    expect(result[0].aiExplanation).toBeTruthy();
    expect(result[0].aiValidation?.cropPath).toBeTruthy();
    expect(fs.existsSync(result[0].aiValidation!.cropPath!)).toBe(true);

    const summary = tracker.summarize();
    expect(summary.totalCalls).toBe(1);
    expect(summary.byIssueType["element-overlap"].confirmed).toBe(1);
  });

  it("suppresses a low-overlap-ratio element-overlap candidate entirely", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "button.a" });
    const elB = makeElement({ id: "el_b", selector: "button.b", boundingBox: { x: 500, y: 500, width: 50, height: 20 } });
    const context = makePageContext([elA, elB]);

    const candidate = makeCandidate({
      element: { selector: "button.a", boundingBox: elA.boundingBox! },
      evidence: { measuredValue: "overlapRatio=0.22", raw: { otherSelector: "button.b" } },
    });

    const tracker = new AiCostTracker();
    const result = await enhanceWithAi([candidate], context, {
      provider: new MockAiProvider({ simulatedLatencyMs: 1 }),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(result).toHaveLength(0);
    expect(tracker.summarize().byIssueType["element-overlap"].suppressed).toBe(1);
  });

  it("demotes confidence for a borderline needs_more_evidence candidate without dropping it", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "button.a" });
    const elB = makeElement({ id: "el_b", selector: "button.b", boundingBox: { x: 55, y: 15, width: 100, height: 40 } });
    const context = makePageContext([elA, elB]);

    const candidate = makeCandidate({
      confidence: 0.6,
      element: { selector: "button.a", boundingBox: elA.boundingBox! },
      evidence: { measuredValue: "overlapRatio=0.45", raw: { otherSelector: "button.b" } },
    });

    const tracker = new AiCostTracker();
    const result = await enhanceWithAi([candidate], context, {
      provider: new MockAiProvider({ simulatedLatencyMs: 1 }),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(result).toHaveLength(1);
    expect(result[0].aiValidation?.decision).toBe("needs_more_evidence");
    expect(result[0].confidence).toBeLessThan(candidate.confidence);
  });

  it("leaves the candidate unchanged when no bounding box is available to build a request from", async () => {
    const screenshotPath = await makeScreenshot();
    const context = makePageContext([]);
    const candidate = makeCandidate({ element: undefined });

    const tracker = new AiCostTracker();
    const result = await enhanceWithAi([candidate], context, {
      provider: new MockAiProvider(),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(result).toEqual([candidate]);
    expect(tracker.summarize().totalCalls).toBe(0);
  });

  it("treats unexpected-disabled-cta and low-confidence broken-svg-icon as AI-eligible", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "button.checkout" });
    const context = makePageContext([elA]);

    const ctaCandidate = makeCandidate({
      issueType: "unexpected-disabled-cta",
      category: "content",
      confidence: 0.65,
      element: { selector: "button.checkout", boundingBox: elA.boundingBox! },
      evidence: {},
    });

    const tracker = new AiCostTracker();
    await enhanceWithAi([ctaCandidate], context, {
      provider: new MockAiProvider({ simulatedLatencyMs: 1 }),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(tracker.summarize().totalCalls).toBe(1);
  });

  it("does NOT send a high-confidence broken-svg-icon candidate to AI (only the ambiguous low-confidence case is eligible)", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "svg.icon" });
    const context = makePageContext([elA]);

    const candidate = makeCandidate({
      issueType: "broken-svg-icon",
      category: "technical",
      confidence: 0.85, // above the 0.75 ambiguity threshold
      element: { selector: "svg.icon", boundingBox: elA.boundingBox! },
    });

    const tracker = new AiCostTracker();
    const result = await enhanceWithAi([candidate], context, {
      provider: new MockAiProvider(),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(result).toEqual([candidate]);
    expect(tracker.summarize().totalCalls).toBe(0);
  });

  it("treats low-contrast-borderline as AI-eligible", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "p.subtitle" });
    const context = makePageContext([elA]);

    const candidate = makeCandidate({
      issueType: "low-contrast-borderline",
      category: "accessibility",
      confidence: 0.6,
      element: { selector: "p.subtitle", boundingBox: elA.boundingBox! },
      evidence: { measuredValue: "contrastRatio=4.3", expectedValue: ">=4.5" },
    });

    const tracker = new AiCostTracker();
    await enhanceWithAi([candidate], context, {
      provider: new MockAiProvider({ simulatedLatencyMs: 1 }),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(tracker.summarize().totalCalls).toBe(1);
  });

  it("treats the low-confidence (class-pattern) empty-component bucket as AI-eligible, but not the high-confidence (tag) bucket", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "div.card", tagName: "div" });
    const elB = makeElement({ id: "el_b", selector: "h2.title", tagName: "h2" });
    const context = makePageContext([elA, elB]);

    const lowConfidenceCandidate = makeCandidate({
      issueType: "empty-component",
      category: "content",
      confidence: 0.55,
      element: { selector: "div.card", boundingBox: elA.boundingBox! },
    });
    const highConfidenceCandidate = makeCandidate({
      issueType: "empty-component",
      category: "content",
      confidence: 0.75,
      element: { selector: "h2.title", boundingBox: elB.boundingBox! },
    });

    const tracker = new AiCostTracker();
    const result = await enhanceWithAi([lowConfidenceCandidate, highConfidenceCandidate], context, {
      provider: new MockAiProvider({ simulatedLatencyMs: 1 }),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(tracker.summarize().totalCalls).toBe(1);
    expect(result.find((r) => r.element?.selector === "h2.title")).toEqual(highConfidenceCandidate);
  });

  it("treats placeholder-generic-token as AI-eligible", async () => {
    const screenshotPath = await makeScreenshot();
    const elA = makeElement({ selector: "p.copy", tagName: "p" });
    const context = makePageContext([elA]);

    const candidate = makeCandidate({
      issueType: "placeholder-generic-token",
      category: "content",
      confidence: 0.6,
      element: { selector: "p.copy", boundingBox: elA.boundingBox! },
    });

    const tracker = new AiCostTracker();
    await enhanceWithAi([candidate], context, {
      provider: new MockAiProvider({ simulatedLatencyMs: 1 }),
      costTracker: tracker,
      viewportScreenshotPath: screenshotPath,
      cropOutDir: tmpDir,
    });

    expect(tracker.summarize().totalCalls).toBe(1);
  });
});
