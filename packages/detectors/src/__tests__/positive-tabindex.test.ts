import { describe, it, expect } from "vitest";
import { positiveTabindexDetector } from "../accessibility/positive-tabindex.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("positiveTabindexDetector", () => {
  it('flags tabindex="1"', () => {
    const ctx = makePageContext({
      elements: [makeElement({ selector: "input.name", attributes: { tabindex: "1" } })],
    });
    const issues = positiveTabindexDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("positive-tabindex");
    expect(issues[0].evidence.measuredValue).toBe('tabindex="1"');
  });

  it('does NOT flag tabindex="0"', () => {
    const ctx = makePageContext({
      elements: [makeElement({ selector: "div.card", attributes: { tabindex: "0" } })],
    });
    expect(positiveTabindexDetector.run(ctx)).toHaveLength(0);
  });

  it('does NOT flag tabindex="-1"', () => {
    const ctx = makePageContext({
      elements: [makeElement({ selector: "div.panel", attributes: { tabindex: "-1" } })],
    });
    expect(positiveTabindexDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag elements with no tabindex attribute at all", () => {
    const ctx = makePageContext({ elements: [makeElement({ selector: "button.plain" })] });
    expect(positiveTabindexDetector.run(ctx)).toHaveLength(0);
  });
});
