import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Flags `id` attribute values that appear on more than one element.
 * HTML5 requires every id to be unique document-wide — a duplicate is
 * unambiguously invalid, not a judgment call, which is why this reports
 * at very high confidence regardless of category default. Duplicate ids
 * silently break exactly the things that depend on id uniqueness:
 * `<label for>` associations, `aria-labelledby`/`aria-describedby`
 * references, in-page anchor links, and any `getElementById`/`#id`
 * lookup in application JS (which always returns the *first* match,
 * masking the bug until the first element is removed or reordered).
 */
export const duplicateElementIdDetector: Detector = {
  id: "duplicate-element-id-v1",
  version: "1.0.0",
  category: "technical",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    const byId = new Map<string, typeof context.elements>();

    for (const el of context.elements) {
      const id = el.attributes.id?.trim();
      if (!id) continue;
      const group = byId.get(id);
      if (group) group.push(el);
      else byId.set(id, [el]);
    }

    for (const [id, group] of byId) {
      if (group.length < 2) continue;

      const anyInteractive = group.some((el) => el.isInteractive);
      const anyLabelTarget = group.some((el) => el.tagName === "input" || el.tagName === "select" || el.tagName === "textarea");
      const signature = `duplicate-element-id:${id}`;

      // Emit one candidate per affected element, all sharing the same
      // rootCauseSignature — the Issue Engine's deduplicator groups by
      // that signature and reports the group size as affectedElementCount,
      // which is the correct way to say "id X is duplicated across N
      // elements" rather than setting a count field directly (detectors
      // never set affectedElementCount themselves; it's derived downstream).
      for (const el of group) {
        candidates.push({
          category: "technical",
          issueType: "duplicate-element-id",
          title: `Duplicate id "${id}" used on ${group.length} elements`,
          description:
            "The same id attribute is used on multiple elements. HTML requires ids to be unique — duplicates silently break label associations, aria-labelledby/aria-describedby references, in-page anchors, and any script that looks elements up by id.",
          severity: anyInteractive || anyLabelTarget ? "high" : "medium",
          confidence: 0.95,
          element: { selector: el.selector, tagName: el.tagName },
          evidence: {
            measuredValue: `id="${id}" appears ${group.length} times`,
            raw: { allSelectors: group.map((g) => g.selector) },
          },
          suggestedFix: "Give each element a unique id, and update any label/aria/anchor references that depended on the old shared id.",
          detector: { id: "duplicate-element-id-v1", version: "1.0.0", source: "deterministic" },
          rootCauseSignature: signature,
        });
      }
    }

    return candidates;
  },
};
