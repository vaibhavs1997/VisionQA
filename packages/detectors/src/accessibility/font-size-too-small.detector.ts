import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

// 11px is a widely-cited floor below which body text becomes genuinely
// hard to read for most users, distinct from deliberately small
// microcopy (legal fine print, timestamps) which usually sits at 12px+.
// Kept conservative on purpose — this is meant to catch clearly-too-small
// text, not to second-guess every caption/label size choice on the page.
const MIN_READABLE_PX = 11;
const MIN_TEXT_LENGTH = 4;

function parsePx(value: string): number | null {
  const match = /^([\d.]+)px$/.exec(value.trim());
  return match ? Number.parseFloat(match[1]) : null;
}

/**
 * Flags visible, meaningful body text rendered below a readable font
 * size. Text-size problems most often come from a responsive breakpoint
 * that shrinks a font-size without a corresponding minimum, or a
 * third-party embed/widget bringing its own undersized styles.
 */
export const fontSizeTooSmallDetector: Detector = {
  id: "font-size-too-small-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const el of context.elements) {
      if (!el.isVisible) continue;
      const text = el.visibleText?.trim();
      if (!text || text.length < MIN_TEXT_LENGTH) continue;

      const fontSizePx = parsePx(el.computedStyle.fontSize);
      if (fontSizePx === null || fontSizePx >= MIN_READABLE_PX) continue;

      candidates.push({
        category: "accessibility",
        issueType: "font-size-too-small",
        title: `Text rendered at ${fontSizePx}px is below a readable size`,
        description: `"${text.slice(0, 60)}${text.length > 60 ? "…" : ""}" renders at ${fontSizePx}px on the ${context.scan.viewport.name} viewport — below the ~${MIN_READABLE_PX}px floor most users can comfortably read without zooming.`,
        severity: fontSizePx < 9 ? "medium" : "low",
        confidence: 0.6,
        element: { selector: el.selector, tagName: el.tagName, text: text.slice(0, 80), boundingBox: el.boundingBox ?? undefined },
        evidence: { measuredValue: `${fontSizePx}px`, expectedValue: `>=${MIN_READABLE_PX}px` },
        suggestedFix: `Increase this text's font-size to at least ${MIN_READABLE_PX}px (16px is the common baseline for body copy).`,
        detector: { id: "font-size-too-small-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `font-size-too-small:${el.selector}`,
      });
    }

    return candidates;
  },
};
