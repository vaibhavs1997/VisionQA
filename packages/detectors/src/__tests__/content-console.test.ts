import { describe, it, expect } from "vitest";
import { emptyComponentDetector } from "../content/empty-component.detector";
import { consoleUiErrorDetector } from "../technical/console-ui-error.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("emptyComponentDetector", () => {
  it("flags a visible, meaningfully-sized heading with no content", () => {
    const el = makeElement({
      tagName: "h2",
      visibleText: "",
      hasMeaningfulChildContent: false,
      boundingBox: { x: 0, y: 0, width: 300, height: 40 },
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = emptyComponentDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
  });

  it("flags an empty element whose class name suggests a card/widget", () => {
    const el = makeElement({
      tagName: "div",
      visibleText: "",
      hasMeaningfulChildContent: false,
      attributes: { class: "product-card" },
      boundingBox: { x: 0, y: 0, width: 240, height: 180 },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(emptyComponentDetector.run(ctx)).toHaveLength(1);
  });

  it("does NOT flag an empty div with no structural significance", () => {
    const el = makeElement({
      tagName: "div",
      visibleText: "",
      hasMeaningfulChildContent: false,
      attributes: {},
      boundingBox: { x: 0, y: 0, width: 300, height: 40 },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(emptyComponentDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a heading that has text", () => {
    const el = makeElement({ tagName: "h2", visibleText: "Real heading", boundingBox: { x: 0, y: 0, width: 300, height: 40 } });
    const ctx = makePageContext({ elements: [el] });
    expect(emptyComponentDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a small element below the area floor", () => {
    const el = makeElement({
      tagName: "h3",
      visibleText: "",
      hasMeaningfulChildContent: false,
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(emptyComponentDetector.run(ctx)).toHaveLength(0);
  });
});

describe("consoleUiErrorDetector", () => {
  it("flags a first-party console error", () => {
    const ctx = makePageContext({
      page: {
        finalUrl: "https://example.test/",
        title: "t",
        loadState: "loaded",
        documentWidth: 100,
        documentHeight: 100,
        viewportWidth: 100,
        viewportHeight: 100,
        scrollWidth: 100,
        scrollHeight: 100,
        hasHorizontalScroll: false,
      },
      consoleMessages: [
        { type: "error", text: "TypeError: cannot read property 'x' of undefined", location: "https://example.test/app.js" },
      ],
    });
    const issues = consoleUiErrorDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
  });

  it("does NOT flag a third-party analytics script error", () => {
    const ctx = makePageContext({
      page: {
        finalUrl: "https://example.test/",
        title: "t",
        loadState: "loaded",
        documentWidth: 100,
        documentHeight: 100,
        viewportWidth: 100,
        viewportHeight: 100,
        scrollWidth: 100,
        scrollHeight: 100,
        hasHorizontalScroll: false,
      },
      consoleMessages: [
        { type: "error", text: "Blocked script", location: "https://www.google-analytics.com/ga.js" },
      ],
    });
    expect(consoleUiErrorDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag non-error console messages (warnings, logs)", () => {
    const ctx = makePageContext({
      consoleMessages: [{ type: "warning", text: "Deprecated API used", location: "https://example.test/app.js" }],
    });
    expect(consoleUiErrorDetector.run(ctx)).toHaveLength(0);
  });

  it("deduplicates the same error message occurring repeatedly", () => {
    const ctx = makePageContext({
      consoleMessages: [
        { type: "error", text: "same error", location: "https://example.test/app.js" },
        { type: "error", text: "same error", location: "https://example.test/app.js" },
      ],
    });
    expect(consoleUiErrorDetector.run(ctx)).toHaveLength(1);
  });
});
