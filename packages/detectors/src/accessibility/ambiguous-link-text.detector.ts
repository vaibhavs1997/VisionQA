import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

// Common generic link phrases that are meaningless out of context — the
// canonical WebAIM/WCAG-technique example set, kept intentionally short
// so this only fires on genuinely ambiguous, well-established phrases
// rather than guessing at borderline wording.
const GENERIC_PHRASES = new Set([
  "click here",
  "here",
  "read more",
  "learn more",
  "more",
  "more info",
  "details",
  "link",
  "this link",
  "continue reading",
  "go",
]);

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Two related but distinct accessibility/UX problems, both about link
 * text failing to describe its destination on its own — screen reader
 * users frequently navigate a page via a list of all links out of
 * context, where generic or duplicate-but-different text is
 * indistinguishable:
 *
 *  1. Generic phrasing ("click here", "read more") that says nothing
 *     about where the link goes.
 *  2. The exact same visible text used for links that point to
 *     different destinations (e.g. five "Read more" article teasers
 *     each linking somewhere different) — each instance is individually
 *     ambiguous even though the phrase itself isn't from the fixed list.
 */
export const ambiguousLinkTextDetector: Detector = {
  id: "ambiguous-link-text-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    const links = context.elements.filter(
      (el) => el.tagName === "a" && el.isVisible && (el.attributes.href || el.isInteractive)
    );

    const byText = new Map<string, typeof links>();

    for (const link of links) {
      const text = normalize(link.accessibleName || link.visibleText || "");
      if (!text) continue;

      if (GENERIC_PHRASES.has(text)) {
        candidates.push({
          category: "accessibility",
          issueType: "generic-link-text",
          title: `Generic link text: "${link.visibleText?.trim() ?? text}"`,
          description:
            "This link's text doesn't describe where it goes. Screen reader users often browse a page's links out of context (e.g. a links list), where generic phrases like this give no information about the destination.",
          severity: "low",
          confidence: 0.7,
          element: { selector: link.selector, tagName: link.tagName, text: link.visibleText?.slice(0, 80) },
          evidence: { measuredValue: text, raw: { href: link.attributes.href } },
          suggestedFix: 'Make the link text describe its destination (e.g. "Read the Q3 earnings report" instead of "Read more"), or add an aria-label with more context.',
          detector: { id: "ambiguous-link-text-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `generic-link-text:${link.selector}`,
        });
        continue;
      }

      const group = byText.get(text) ?? [];
      group.push(link);
      byText.set(text, group);
    }

    for (const [text, group] of byText) {
      if (group.length < 2) continue;
      const distinctHrefs = new Set(group.map((l) => l.attributes.href).filter(Boolean));
      if (distinctHrefs.size < 2) continue; // same text, same destination — fine (e.g. repeated nav links)

      for (const link of group) {
        candidates.push({
          category: "accessibility",
          issueType: "duplicate-link-text-different-destinations",
          title: `Link text "${text}" reused for ${distinctHrefs.size} different destinations`,
          description:
            "Multiple links share identical text but point to different pages. Out of context (e.g. a screen reader's links list), these are indistinguishable even though they go different places.",
          severity: "low",
          confidence: 0.6,
          element: { selector: link.selector, tagName: link.tagName, text: link.visibleText?.slice(0, 80) },
          evidence: { measuredValue: text, raw: { href: link.attributes.href, distinctDestinationCount: distinctHrefs.size } },
          suggestedFix: 'Give each link distinguishing text or an aria-label (e.g. append the article title: "Read more: <Title>").',
          detector: { id: "ambiguous-link-text-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `duplicate-link-text:${text}`,
        });
      }
    }

    return candidates;
  },
};
