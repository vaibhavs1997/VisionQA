import { describe, it, expect } from "vitest";
import { redactText, redactObjectDeep } from "../redaction";

describe("redactText", () => {
  it("redacts email addresses", () => {
    const { text, redactionsApplied } = redactText("Contact us at support@example.com for help.");
    expect(text).toContain("[REDACTED_EMAIL]");
    expect(text).not.toContain("support@example.com");
    expect(redactionsApplied).toBe(1);
  });

  it("redacts long token-like strings", () => {
    const { text, redactionsApplied } = redactText("api_key=abcdefghijklmnopqrstuvwxyz123456 done");
    expect(text).toContain("[REDACTED_TOKEN]");
    expect(redactionsApplied).toBeGreaterThan(0);
  });

  it("redacts credit-card-like digit sequences", () => {
    const { text, redactionsApplied } = redactText("Card on file: 4111 1111 1111 1111 expires soon");
    expect(text).toContain("[REDACTED_NUMBER]");
    expect(redactionsApplied).toBeGreaterThan(0);
  });

  it("leaves ordinary short text completely unchanged", () => {
    const { text, redactionsApplied } = redactText("Submit button is disabled with no loading state.");
    expect(text).toBe("Submit button is disabled with no loading state.");
    expect(redactionsApplied).toBe(0);
  });

  it("does not redact short ordinary words as tokens", () => {
    const { redactionsApplied } = redactText("The quick brown fox jumps over the lazy dog repeatedly.");
    expect(redactionsApplied).toBe(0);
  });

  it("counts multiple distinct redactions in one string", () => {
    const { redactionsApplied } = redactText("Email me at a@b.com or call about card 4111111111111111.");
    expect(redactionsApplied).toBe(2);
  });
});

describe("redactObjectDeep", () => {
  it("redacts strings nested inside objects and arrays", () => {
    const input = {
      element: { text: "Reach out to jane@company.com", selector: "#footer" },
      nearby: [{ text: "no PII here" }, { text: "call sales@company.com" }],
    };
    const { value, redactionsApplied } = redactObjectDeep(input);
    expect(value.element.text).toContain("[REDACTED_EMAIL]");
    expect(value.nearby[1].text).toContain("[REDACTED_EMAIL]");
    expect(value.nearby[0].text).toBe("no PII here");
    expect(redactionsApplied).toBe(2);
  });

  it("leaves non-string values untouched", () => {
    const input = { count: 42, active: true, nested: { ratio: 0.85 } };
    const { value } = redactObjectDeep(input);
    expect(value).toEqual(input);
  });

  it("handles undefined/null gracefully", () => {
    const { value } = redactObjectDeep({ maybe: undefined, definitely: null });
    expect(value.maybe).toBeUndefined();
    expect(value.definitely).toBeNull();
  });
});
