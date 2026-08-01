import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const PRIMARY_CTA_TEXT_PATTERN =
  /\b(submit|continue|next|checkout|buy|purchase|pay|sign\s?up|register|save|confirm|complete|proceed|get started|create account|place order)\b/i;

/**
 * Flags visible primary-action buttons that are disabled with no visible
 * loading indicator — the "call to action is dead and gives the user no
 * explanation" defect. Deliberately narrow: only buttons/role=button
 * elements whose text matches a well-known primary-CTA vocabulary, since
 * "disabled until validation passes" is a completely normal and correct
 * pattern for other buttons (and even for CTAs, mid-flow — this is a P2
 * candidate detector precisely because "unexpected" is doing a lot of
 * work and false positives are easy).
 */
export const unexpectedDisabledCtaDetector: Detector = {
  id: "unexpected-disabled-cta-v1",
  version: "1.0.0",
  category: "content",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const el of context.elements) {
      if (!el.isVisible) continue;
      const isButtonLike = el.tagName === "button" || el.role === "button";
      if (!isButtonLike) continue;

      const isDisabled =
        "disabled" in el.attributes || el.attributes["aria-disabled"] === "true";
      if (!isDisabled) continue;

      const isBusy = el.attributes["aria-busy"] === "true";
      if (isBusy) continue; // legitimately mid-submission — not the defect this detects

      const className = el.attributes.class || "";
      if (/loading|spinner|busy|pending/i.test(className)) continue;

      const text = (el.visibleText ?? el.accessibleName ?? "").trim();
      if (!PRIMARY_CTA_TEXT_PATTERN.test(text)) continue;

      candidates.push({
        category: "content",
        issueType: "unexpected-disabled-cta",
        title: "Primary call-to-action is disabled with no loading state",
        description: `A primary action button ("${text}") is disabled but shows no loading/busy indicator, which likely leaves the user stuck with no explanation.`,
        severity: "high",
        confidence: 0.65,
        element: {
          selector: el.selector,
          tagName: el.tagName,
          text: text.slice(0, 80),
          boundingBox: el.boundingBox ?? undefined,
        },
        evidence: {
          measuredValue: "disabled=true, aria-busy is not true, no loading/spinner class detected",
        },
        suggestedFix:
          "Either show a loading/validation state explaining why the button is disabled, or verify it should be enabled at this point in the flow.",
        detector: { id: "unexpected-disabled-cta-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `unexpected-disabled-cta:${el.selector}`,
      });
    }

    return candidates;
  },
};
