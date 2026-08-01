import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

function parseColor(color: string): [number, number, number, number] | null {
  const rgbaMatch = color.match(/rgba?\(([^)]+)\)/i);
  if (!rgbaMatch) return null;
  const parts = rgbaMatch[1].split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length < 3) return null;
  return [parts[0], parts[1], parts[2], parts.length === 4 ? parts[3] : 1];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(fg: [number, number, number, number], bg: [number, number, number, number]): number {
  const l1 = relativeLuminance(fg[0], fg[1], fg[2]);
  const l2 = relativeLuminance(bg[0], bg[1], bg[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG-style contrast check between an element's own text color and its
 * *effective* background (the first non-transparent background found
 * walking up the ancestor chain — computed during collection, since the
 * element's own background is very often transparent).
 *
 * Deliberately conservative and labeled a "candidate," per the spec: text
 * color with alpha < 1, background colors we couldn't resolve, and very
 * small text samples are skipped rather than guessed at, since a wrong
 * contrast call is a particularly credibility-damaging false positive.
 */
export const lowContrastCandidateDetector: Detector = {
  id: "low-contrast-candidate-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const el of context.elements) {
      if (!el.isVisible || !el.visibleText || el.visibleText.trim().length === 0) continue;
      if (el.hasUnresolvedBackground) continue; // gradient/image background — can't compute real contrast, don't guess

      const fg = parseColor(el.computedStyle.color);
      const bg = parseColor(el.effectiveBackgroundColor ?? "");
      if (!fg || !bg) continue;
      if (fg[3] < 1 || bg[3] < 1) continue; // don't guess through transparency

      const ratio = contrastRatio(fg, bg);

      const fontSizePx = Number.parseFloat(el.computedStyle.fontSize) || 16;
      const fontWeightNum = Number.parseInt(el.computedStyle.fontWeight, 10);
      const isBold = el.computedStyle.fontWeight === "bold" || (!Number.isNaN(fontWeightNum) && fontWeightNum >= 700);
      const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && isBold);
      const requiredRatio = isLargeText ? 3.0 : 4.5;

      if (ratio >= requiredRatio) continue;

      // Only flag clearly-failing cases in Phase 1 (ratio meaningfully
      // below the requirement) — borderline cases (within 0.3 of the
      // threshold) are exactly the kind of ambiguous judgment call
      // reserved for AI validation in Phase 2, not a deterministic call.
      if (ratio > requiredRatio - 0.3) continue;

      const confidence = ratio < requiredRatio - 1.5 ? 0.75 : 0.6;

      candidates.push({
        category: "accessibility",
        issueType: "low-contrast-candidate",
        title: "Text contrast likely fails WCAG AA",
        description: `Computed contrast ratio ${ratio.toFixed(
          2
        )}:1 is below the ${requiredRatio}:1 minimum for ${isLargeText ? "large" : "normal"} text.`,
        severity: ratio < 2.5 ? "high" : "medium",
        confidence,
        element: {
          selector: el.selector,
          tagName: el.tagName,
          text: el.visibleText.slice(0, 80),
          boundingBox: el.boundingBox ?? undefined,
        },
        evidence: {
          measuredValue: `contrastRatio=${ratio.toFixed(2)}`,
          expectedValue: `>=${requiredRatio}`,
        },
        suggestedFix: "Darken the text color or lighten the background to meet WCAG AA contrast requirements.",
        detector: { id: "low-contrast-candidate-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `low-contrast-candidate:${el.selector}`,
      });
    }

    return candidates;
  },
};
