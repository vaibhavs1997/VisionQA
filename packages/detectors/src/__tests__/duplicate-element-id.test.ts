import { describe, it, expect } from "vitest";
import { duplicateElementIdDetector } from "../technical/duplicate-element-id.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("duplicateElementIdDetector", () => {
  it("flags two elements sharing the same id, one candidate per element", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ selector: "#nav a:nth-of-type(1)", attributes: { id: "cta" } }),
        makeElement({ selector: "#footer a:nth-of-type(1)", attributes: { id: "cta" } }),
      ],
    });
    const issues = duplicateElementIdDetector.run(ctx) as any[];
    expect(issues).toHaveLength(2);
    expect(issues[0].issueType).toBe("duplicate-element-id");
    expect(issues[0].rootCauseSignature).toBe(issues[1].rootCauseSignature);
    expect(issues[0].confidence).toBe(0.95);
  });

  it("escalates severity to high when a form field is involved (breaks label associations)", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ tagName: "input", selector: "input#email-1", attributes: { id: "email" } }),
        makeElement({ tagName: "input", selector: "input#email-2", attributes: { id: "email" } }),
      ],
    });
    const issues = duplicateElementIdDetector.run(ctx) as any[];
    expect(issues[0].severity).toBe("high");
  });

  it("does NOT flag unique ids", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ selector: "#a", attributes: { id: "a" } }),
        makeElement({ selector: "#b", attributes: { id: "b" } }),
      ],
    });
    expect(duplicateElementIdDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag elements with no id attribute", () => {
    const ctx = makePageContext({ elements: [makeElement({}), makeElement({})] });
    expect(duplicateElementIdDetector.run(ctx)).toHaveLength(0);
  });
});
