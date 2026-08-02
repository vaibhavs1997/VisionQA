import { describe, it, expect } from "vitest";
import { lowContrastCandidateDetector } from "../accessibility/low-contrast-candidate.detector";
import { unexpectedDisabledCtaDetector } from "../content/unexpected-disabled-cta.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("lowContrastCandidateDetector", () => {
  it("flags light gray text on a white background (clearly fails AA)", () => {
    const el = makeElement({
      visibleText: "Hard to read text",
      computedStyle: { color: "rgb(200, 200, 200)", fontSize: "14px", fontWeight: "400" } as any,
      effectiveBackgroundColor: "rgb(255, 255, 255)",
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = lowContrastCandidateDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
  });

  it("does NOT flag black text on white (passes AA easily)", () => {
    const el = makeElement({
      visibleText: "Perfectly readable",
      computedStyle: { color: "rgb(0, 0, 0)", fontSize: "16px" } as any,
      effectiveBackgroundColor: "rgb(255, 255, 255)",
    });
    const ctx = makePageContext({ elements: [el] });
    expect(lowContrastCandidateDetector.run(ctx)).toHaveLength(0);
  });

  it("applies the lower 3:1 threshold to large bold text", () => {
    // A ratio that fails normal text (4.5) but passes large-text (3.0)
    // should NOT be flagged when the text is large and bold.
    const el = makeElement({
      visibleText: "Big Heading",
      computedStyle: { color: "rgb(120, 120, 120)", fontSize: "24px", fontWeight: "700" } as any,
      effectiveBackgroundColor: "rgb(255, 255, 255)",
    });
    const ctx = makePageContext({ elements: [el] });
    // rgb(120,120,120) on white is roughly 3.5:1 — passes large-text (3.0) but not normal (4.5)
    expect(lowContrastCandidateDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag when color has partial transparency (avoid guessing)", () => {
    const el = makeElement({
      visibleText: "Text",
      computedStyle: { color: "rgba(0, 0, 0, 0.5)", fontSize: "16px" } as any,
      effectiveBackgroundColor: "rgb(255, 255, 255)",
    });
    const ctx = makePageContext({ elements: [el] });
    expect(lowContrastCandidateDetector.run(ctx)).toHaveLength(0);
  });

  it("emits a low-confidence low-contrast-borderline candidate (not the clear-fail issueType) for cases close to the threshold", () => {
    // rgb(122,122,122) on white computes to ~4.29:1 — just under the 4.5
    // requirement but within the 0.3 grace band (4.2-4.5).
    const el = makeElement({
      visibleText: "Borderline text",
      computedStyle: { color: "rgb(122, 122, 122)", fontSize: "16px", fontWeight: "400" } as any,
      effectiveBackgroundColor: "rgb(255, 255, 255)",
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = lowContrastCandidateDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("low-contrast-borderline");
    expect(issues[0].confidence).toBe(0.6);
    expect(issues[0].severity).toBe("low");
  });
});

describe("unexpectedDisabledCtaDetector", () => {
  it("flags a disabled primary CTA with no loading indicator", () => {
    const el = makeElement({
      tagName: "button",
      visibleText: "Submit",
      attributes: { disabled: "" },
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = unexpectedDisabledCtaDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high");
  });

  it("does NOT flag a disabled CTA with aria-busy=true (legitimately submitting)", () => {
    const el = makeElement({
      tagName: "button",
      visibleText: "Submit",
      attributes: { disabled: "", "aria-busy": "true" },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(unexpectedDisabledCtaDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a disabled CTA with a loading/spinner class", () => {
    const el = makeElement({
      tagName: "button",
      visibleText: "Submit",
      attributes: { disabled: "", class: "btn btn-loading" },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(unexpectedDisabledCtaDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a disabled non-primary button (e.g. 'Cancel')", () => {
    const el = makeElement({ tagName: "button", visibleText: "Cancel", attributes: { disabled: "" } });
    const ctx = makePageContext({ elements: [el] });
    expect(unexpectedDisabledCtaDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag an enabled primary CTA", () => {
    const el = makeElement({ tagName: "button", visibleText: "Submit", attributes: {} });
    const ctx = makePageContext({ elements: [el] });
    expect(unexpectedDisabledCtaDetector.run(ctx)).toHaveLength(0);
  });
});
