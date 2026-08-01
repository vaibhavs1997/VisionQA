import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Flags @font-face declarations whose FontFace entry ends in status
 * "error" — meaning the browser attempted to load it and failed, so the
 * page is silently falling back to a system font. Fonts still in
 * "unloaded"/"loading" after the document.fonts.ready race (see
 * collector) are NOT flagged — they may simply not have been triggered
 * by any rendered text yet, which is normal and not a defect.
 */
export const fontLoadFailureDetector: Detector = {
  id: "font-load-failure-v1",
  version: "1.0.0",
  category: "technical",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const seenFamilies = new Set<string>();

    for (const font of context.fonts) {
      if (font.status !== "error") continue;
      if (seenFamilies.has(font.family)) continue; // one card per family, not per weight/style variant
      seenFamilies.add(font.family);

      candidates.push({
        category: "technical",
        issueType: "font-load-failure",
        title: "Custom font failed to load",
        description: `The font family "${font.family}" failed to load and the page is silently falling back to a system font.`,
        severity: "low",
        confidence: 0.9,
        evidence: {
          measuredValue: `family=${font.family}, status=error`,
        },
        suggestedFix:
          "Verify the font file path/CORS headers, or add a matching system-font fallback in the font-family stack so the fallback looks intentional.",
        detector: { id: "font-load-failure-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `font-load-failure:${font.family}`,
      });
    }

    return candidates;
  },
};
