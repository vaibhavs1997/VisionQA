import { describe, it, expect } from "vitest";
import { missingAltDetector } from "../accessibility/missing-alt.detector";
import { placeholderContentDetector } from "../content/placeholder-content.detector";
import { makePageContext, makeImage, makeElement } from "./fixtures";

describe("missingAltDetector", () => {
  it("flags a large content image with no alt attribute", () => {
    const ctx = makePageContext({
      images: [makeImage({ alt: undefined, boundingBox: { x: 0, y: 0, width: 400, height: 300 } })],
    });
    const issues = missingAltDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].confidence).toBe(0.95);
  });

  it("does NOT flag an image with meaningful alt text", () => {
    const ctx = makePageContext({ images: [makeImage({ alt: "Team photo" })] });
    expect(missingAltDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag role=presentation images", () => {
    const ctx = makePageContext({ images: [makeImage({ alt: undefined, role: "presentation" })] });
    expect(missingAltDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a small icon with empty alt (legitimate decorative pattern)", () => {
    const ctx = makePageContext({
      images: [makeImage({ alt: "", boundingBox: { x: 0, y: 0, width: 20, height: 20 } })],
    });
    expect(missingAltDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag aria-hidden images", () => {
    const ctx = makePageContext({ images: [makeImage({ alt: undefined, ariaHidden: true })] });
    expect(missingAltDetector.run(ctx)).toHaveLength(0);
  });
});

describe("placeholderContentDetector", () => {
  it("flags Lorem Ipsum text with high confidence", () => {
    const el = makeElement({ visibleText: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." });
    const ctx = makePageContext({ elements: [el] });
    const issues = placeholderContentDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("placeholder-lorem-ipsum");
    expect(issues[0].severity).toBe("critical");
  });

  it("does NOT flag a single occurrence of a generic token like 'test'", () => {
    const el = makeElement({ visibleText: "This is a test of our new feature." });
    const ctx = makePageContext({ elements: [el] });
    // "test" alone isn't in GENERIC_PLACEHOLDER_TOKENS (which requires
    // patterns like TODO/FIXME/test123) — single legitimate use of the
    // word "test" should never be flagged.
    expect(placeholderContentDetector.run(ctx)).toHaveLength(0);
  });

  it("flags generic placeholder tokens only when they occur 2+ times on the page", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ id: "a", selector: "h3.a", visibleText: "TODO: replace this heading" }),
        makeElement({ id: "b", selector: "p.b", visibleText: "TODO: write real copy" }),
      ],
    });
    const issues = placeholderContentDetector.run(ctx) as any[];
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.every((i) => i.issueType === "placeholder-generic-token")).toBe(true);
  });

  it("does NOT flag a single TODO occurrence", () => {
    const ctx = makePageContext({
      elements: [makeElement({ visibleText: "TODO: this is the only occurrence" })],
    });
    expect(placeholderContentDetector.run(ctx)).toHaveLength(0);
  });
});
