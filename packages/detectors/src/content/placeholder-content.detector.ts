import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

// High-confidence: unambiguous Lorem Ipsum n-grams. Matching multi-word
// phrases (not single keywords) avoids false-positives on real copy that
// happens to contain one of these words in isolation.
const LOREM_IPSUM_PHRASES = [
  "lorem ipsum",
  "dolor sit amet",
  "consectetur adipiscing",
  "sed do eiusmod",
  "ut enim ad minim veniam",
  "excepteur sint occaecat",
];

// Lower-confidence generic placeholder tokens — require >= 2 independent
// matches on the page before flagging, since single occurrences of "test"
// or "TODO" are common in legitimate technical/marketing copy.
const GENERIC_PLACEHOLDER_TOKENS = [
  /\btodo\b/i,
  /\bfixme\b/i,
  /\bxxxx+\b/i,
  /\btest\s*123\b/i,
  /\bplaceholder\s+(text|copy|content)\b/i,
  /\bsample\s+text\b/i,
  /\bdummy\s+(text|content|copy)\b/i,
];

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4"]);
const CTA_HINT_PATTERN = /\b(cta|card|banner|hero|button)\b/i;

export const placeholderContentDetector: Detector = {
  id: "placeholder-content-v1",
  version: "1.0.0",
  category: "content",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const genericMatchCount = new Map<string, number>();

    // First pass: count generic-token matches across the page so we can
    // apply the ">=2 matches" rule before emitting any generic-token issue.
    for (const el of context.elements) {
      if (!el.isVisible || !el.visibleText) continue;
      for (const pattern of GENERIC_PLACEHOLDER_TOKENS) {
        if (pattern.test(el.visibleText)) {
          genericMatchCount.set(pattern.source, (genericMatchCount.get(pattern.source) ?? 0) + 1);
        }
      }
    }

    const seenSelectors = new Set<string>();

    for (const el of context.elements) {
      if (!el.isVisible || !el.visibleText || el.visibleText.length < 3) continue;
      if (seenSelectors.has(el.selector)) continue;

      const text = el.visibleText;
      const lower = text.toLowerCase();
      const isImportantElement =
        HEADING_TAGS.has(el.tagName) || CTA_HINT_PATTERN.test(el.attributes.class ?? "");

      const loremMatch = LOREM_IPSUM_PHRASES.find((phrase) => lower.includes(phrase));
      if (loremMatch) {
        seenSelectors.add(el.selector);
        candidates.push({
          category: "content",
          issueType: "placeholder-lorem-ipsum",
          title: "Placeholder Lorem Ipsum text found",
          description: `Visible text matches the Lorem Ipsum placeholder pattern ("${loremMatch}").`,
          severity: "critical",
          confidence: 0.95,
          element: { selector: el.selector, tagName: el.tagName, text: text.slice(0, 200) },
          evidence: { measuredValue: text.slice(0, 200) },
          suggestedFix: "Replace this placeholder copy with final production content.",
          detector: { id: "placeholder-content-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: `placeholder-content:${el.selector}`,
        });
        continue;
      }

      for (const pattern of GENERIC_PLACEHOLDER_TOKENS) {
        if (pattern.test(text) && (genericMatchCount.get(pattern.source) ?? 0) >= 2) {
          seenSelectors.add(el.selector);
          candidates.push({
            category: "content",
            issueType: "placeholder-generic-token",
            title: "Likely placeholder text found",
            description: `Visible text matches a generic placeholder pattern and appears more than once on the page.`,
            severity: isImportantElement ? "medium" : "low",
            confidence: 0.6,
            element: { selector: el.selector, tagName: el.tagName, text: text.slice(0, 200) },
            evidence: { measuredValue: text.slice(0, 200) },
            suggestedFix: "Confirm this is not leftover placeholder/test copy before release.",
            detector: { id: "placeholder-content-v1", version: "1.0.0", source: "deterministic" },
            rootCauseSignature: `placeholder-content:${el.selector}`,
          });
          break;
        }
      }
    }

    return candidates;
  },
};
