import { describe, it, expect } from "vitest";
import { missingFormLabelDetector } from "../accessibility/missing-form-label.detector";
import { missingAccessibleNameDetector } from "../accessibility/missing-accessible-name.detector";
import { makePageContext, makeElement, makeFormElement } from "./fixtures";

describe("missingFormLabelDetector", () => {
  it("flags an input with no label at all, high severity", () => {
    const el = makeFormElement();
    const ctx = makePageContext({ elements: [el] });
    const issues = missingFormLabelDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high");
  });

  it("lowers severity (but still flags) when a placeholder is present", () => {
    const el = makeFormElement({
      formFieldInfo: {
        inputType: "email",
        hasLabelElement: false,
        hasAriaLabel: false,
        hasAriaLabelledBy: false,
        hasPlaceholder: true,
        isHidden: false,
      },
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = missingFormLabelDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("medium");
  });

  it("does NOT flag a field with an associated <label>", () => {
    const el = makeFormElement({
      formFieldInfo: {
        hasLabelElement: true,
        hasAriaLabel: false,
        hasAriaLabelledBy: false,
        hasPlaceholder: false,
        isHidden: false,
      },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(missingFormLabelDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a hidden input", () => {
    const el = makeFormElement({
      formFieldInfo: {
        inputType: "hidden",
        hasLabelElement: false,
        hasAriaLabel: false,
        hasAriaLabelledBy: false,
        hasPlaceholder: false,
        isHidden: true,
      },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(missingFormLabelDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a submit button (not a data-entry field)", () => {
    const el = makeFormElement({
      formFieldInfo: {
        inputType: "submit",
        hasLabelElement: false,
        hasAriaLabel: false,
        hasAriaLabelledBy: false,
        hasPlaceholder: false,
        isHidden: false,
      },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(missingFormLabelDetector.run(ctx)).toHaveLength(0);
  });
});

describe("missingAccessibleNameDetector", () => {
  it("flags an icon-only button with no accessible name", () => {
    const el = makeElement({
      tagName: "button",
      isInteractive: true,
      accessibleName: "",
      hasMeaningfulChildContent: true,
    });
    const ctx = makePageContext({ elements: [el] });
    const issues = missingAccessibleNameDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].confidence).toBe(0.95);
  });

  it("does NOT flag a button with a computed accessible name", () => {
    const el = makeElement({ tagName: "button", isInteractive: true, accessibleName: "Close menu" });
    const ctx = makePageContext({ elements: [el] });
    expect(missingAccessibleNameDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag an anchor with no href (styling hook, not a real link)", () => {
    const el = makeElement({ tagName: "a", isInteractive: true, accessibleName: "", attributes: {} });
    const ctx = makePageContext({ elements: [el] });
    expect(missingAccessibleNameDetector.run(ctx)).toHaveLength(0);
  });

  it("flags an anchor with an href and no accessible name", () => {
    const el = makeElement({
      tagName: "a",
      isInteractive: true,
      accessibleName: "",
      attributes: { href: "/settings" },
    });
    const ctx = makePageContext({ elements: [el] });
    expect(missingAccessibleNameDetector.run(ctx)).toHaveLength(1);
  });

  it("does NOT flag aria-hidden elements", () => {
    const el = makeElement({ tagName: "button", isInteractive: true, accessibleName: "", ariaHidden: true });
    const ctx = makePageContext({ elements: [el] });
    expect(missingAccessibleNameDetector.run(ctx)).toHaveLength(0);
  });
});
