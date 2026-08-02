import { PageContext, IssueCandidate, ElementSnapshot } from "@ui-quality/shared";
import { Detector } from "../types";

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function headingLevel(tagName: string): number {
  return Number.parseInt(tagName.slice(1), 10);
}

/**
 * Checks the document's heading structure for two well-established
 * WCAG 1.3.1 problems, using nothing but tagName + DOM order (elements
 * arrive from `document.querySelectorAll("body, body *")`, which is
 * always document order — so array order IS DOM order):
 *
 *  1. A level skip (e.g. an h2 followed directly by an h4, with no h3 in
 *     between) — screen reader users navigate by heading level to build a
 *     mental outline of the page, and a skipped level reads as a
 *     structural gap or a missing section.
 *  2. Multiple visible `<h1>` elements — a page should have exactly one
 *     top-level heading; more than one flattens the "what page am I on"
 *     signal the h1 is supposed to give.
 *
 * Only visible headings are considered — an off-screen or
 * `display:none` heading (common in duplicated mobile/desktop markup)
 * isn't part of the outline a user actually encounters.
 */
export const headingHierarchySkipDetector: Detector = {
  id: "heading-hierarchy-skip-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    const headings: ElementSnapshot[] = context.elements.filter(
      (el) => HEADING_TAGS.has(el.tagName) && el.isVisible
    );

    if (headings.length === 0) return candidates;

    const h1s = headings.filter((h) => h.tagName === "h1");
    if (h1s.length > 1) {
      for (const h of h1s.slice(1)) {
        candidates.push({
          category: "accessibility",
          issueType: "multiple-h1-headings",
          title: "Multiple <h1> elements on one page",
          description: `Found ${h1s.length} visible <h1> elements. A page should generally have exactly one top-level heading — multiple h1s make it ambiguous what the page's main subject is, especially for screen reader users navigating by heading.`,
          severity: "medium",
          confidence: 0.75,
          element: { selector: h.selector, tagName: h.tagName, text: h.visibleText?.slice(0, 120) },
          evidence: { measuredValue: `${h1s.length} visible <h1> elements found` },
          suggestedFix: "Keep a single <h1> per page (the main title) and demote the others to <h2> or lower based on their place in the outline.",
          detector: { id: "heading-hierarchy-skip-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: "multiple-h1-headings",
        });
      }
    }

    let previousLevel: number | null = null;
    for (const heading of headings) {
      const level = headingLevel(heading.tagName);
      if (previousLevel !== null && level > previousLevel + 1) {
        candidates.push({
          category: "accessibility",
          issueType: "heading-level-skip",
          title: `Heading level skips from h${previousLevel} to h${level}`,
          description:
            "Heading levels jump by more than one step. Screen reader users build a mental outline of the page from heading levels — a skipped level reads as a missing section or a structural gap, not just a smaller heading.",
          severity: "medium",
          confidence: 0.7,
          element: { selector: heading.selector, tagName: heading.tagName, text: heading.visibleText?.slice(0, 120) },
          evidence: { measuredValue: `h${previousLevel} → h${level}`, expectedValue: `h${previousLevel} → h${previousLevel + 1}` },
          suggestedFix: `Use h${previousLevel + 1} here, or restructure the outline so heading levels only ever increase by one at a time.`,
          detector: { id: "heading-hierarchy-skip-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `heading-level-skip:${heading.selector}`,
        });
      }
      previousLevel = level;
    }

    return candidates;
  },
};
