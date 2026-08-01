import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Flags visible input/select/textarea elements with no accessible label:
 * no <label for>, no wrapping <label>, no aria-label, no
 * aria-labelledby, and (as a partial mitigation, not a substitute) no
 * placeholder either — placeholder text disappears on input and is not
 * a reliable accessible name, so its presence lowers severity but does
 * not suppress the finding.
 */
export const missingFormLabelDetector: Detector = {
  id: "missing-form-label-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const el of context.elements) {
      const info = el.formFieldInfo;
      if (!info) continue;
      if (info.isHidden) continue;
      if (!el.isVisible) continue;
      if (info.inputType && ["submit", "button", "reset", "image"].includes(info.inputType)) continue;

      const hasAccessibleLabel = info.hasLabelElement || info.hasAriaLabel || info.hasAriaLabelledBy;
      if (hasAccessibleLabel) continue;

      const severity = info.hasPlaceholder ? "medium" : "high";
      const confidence = info.hasPlaceholder ? 0.85 : 0.95;

      candidates.push({
        category: "accessibility",
        issueType: "missing-form-label",
        title: "Form field has no accessible label",
        description: info.hasPlaceholder
          ? "This field relies on placeholder text only, which disappears on input and is not a reliable accessible name for screen reader users."
          : "This field has no <label>, aria-label, or aria-labelledby, so screen reader users cannot tell what it's for.",
        severity,
        confidence,
        element: {
          selector: el.selector,
          tagName: el.tagName,
          boundingBox: el.boundingBox ?? undefined,
        },
        evidence: {
          measuredValue: `inputType=${info.inputType ?? el.tagName}`,
        },
        suggestedFix:
          "Add a <label for=\"...\"> associated with this field's id, or an aria-label/aria-labelledby attribute.",
        detector: { id: "missing-form-label-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `missing-form-label:${el.selector}`,
      });
    }

    return candidates;
  },
};
