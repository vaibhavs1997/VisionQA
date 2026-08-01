import { describe, it, expect } from "vitest";
import { validateAiResponse } from "../schemas/ai-validation.schema";

describe("validateAiResponse", () => {
  it("accepts a well-formed confirm response", () => {
    const result = validateAiResponse({
      decision: "confirm",
      confidence: 0.85,
      explanation: "The two buttons visually overlap by roughly half their area with no z-index separation.",
      suggestedFix: "Add spacing between the buttons or fix the absolute positioning.",
      evidenceSummary: "Button B's left edge sits inside Button A's box with no visual separation.",
    });
    expect(result.valid).toBe(true);
    expect(result.response?.decision).toBe("confirm");
  });

  it("parses a JSON string wrapped in markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify({
      decision: "suppress",
      confidence: 0.8,
      explanation: "This is a modal dialog intentionally overlaying background content.",
      evidenceSummary: "The overlapping element has role=dialog and a visible backdrop.",
    }) + "\n```";
    const result = validateAiResponse(raw);
    expect(result.valid).toBe(true);
    expect(result.response?.decision).toBe("suppress");
  });

  it("rejects invalid JSON", () => {
    const result = validateAiResponse("this is not json at all {");
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toContain("not valid JSON");
  });

  it("rejects a response missing required fields", () => {
    const result = validateAiResponse({ decision: "confirm", confidence: 0.9 });
    expect(result.valid).toBe(false);
  });

  it("rejects a vague explanation that's too short", () => {
    const result = validateAiResponse({
      decision: "confirm",
      confidence: 0.9,
      explanation: "Bad UI.",
      evidenceSummary: "It looks wrong somehow, hard to say exactly why.",
    });
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toContain("explanation");
  });

  it("rejects a vague evidenceSummary", () => {
    const result = validateAiResponse({
      decision: "confirm",
      confidence: 0.9,
      explanation: "The elements clearly overlap in a way that looks unintentional based on the screenshot.",
      evidenceSummary: "bad",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects confidence outside 0-1", () => {
    const result = validateAiResponse({
      decision: "confirm",
      confidence: 1.5,
      explanation: "The elements clearly overlap in a way that looks unintentional based on the screenshot.",
      evidenceSummary: "Button B overlaps Button A by half its area with no separation.",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects an invalid decision enum value", () => {
    const result = validateAiResponse({
      decision: "yes_probably",
      confidence: 0.9,
      explanation: "The elements clearly overlap in a way that looks unintentional based on the screenshot.",
      evidenceSummary: "Button B overlaps Button A by half its area with no separation.",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a 'confirm' decision with confidence below the usable floor", () => {
    const result = validateAiResponse({
      decision: "confirm",
      confidence: 0.3,
      explanation: "The elements might overlap but the screenshot is unclear about the exact positioning.",
      evidenceSummary: "Unclear visual evidence from the provided crop of the region.",
    });
    expect(result.valid).toBe(false);
    expect(result.rejectionReason).toContain("usable floor");
  });

  it("accepts 'needs_more_evidence' even at low confidence", () => {
    const result = validateAiResponse({
      decision: "needs_more_evidence",
      confidence: 0.2,
      explanation: "The crop doesn't show enough surrounding context to determine intent here.",
      evidenceSummary: "Insufficient visual context provided in the cropped screenshot region.",
    });
    expect(result.valid).toBe(true);
  });
});
