import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const NAMEABLE_TAGS = new Set(["button", "a"]);
const NAMEABLE_ROLES = new Set(["button", "link", "menuitem", "tab"]);

/**
 * Flags interactive elements (button, link, or role=button/link/etc.)
 * with no computed accessible name — the classic icon-only-button
 * anti-pattern where a screen reader user has no idea what the control
 * does. accessibleName is computed once, in the browser, during
 * collection (text content, aria-label, aria-labelledby, title, or a
 * child img's alt) — this detector only has to check whether it's empty.
 */
export const missingAccessibleNameDetector: Detector = {
  id: "missing-accessible-name-v1",
  version: "1.0.0",
  category: "accessibility",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];

    for (const el of context.elements) {
      if (!el.isVisible) continue;
      if (el.ariaHidden) continue;

      const isNameable = NAMEABLE_TAGS.has(el.tagName) || (el.role && NAMEABLE_ROLES.has(el.role));
      if (!isNameable) continue;

      // Anchors with no href are not real navigation controls (often used
      // as styling hooks) — skip to reduce noise.
      if (el.tagName === "a" && !el.attributes.href) continue;

      const accessibleName = (el.accessibleName ?? "").trim();
      if (accessibleName.length > 0) continue;

      // An icon-only control is only a real problem if it visually renders
      // something (an icon/SVG/background image) — a genuinely empty
      // element is more likely a template/loading placeholder, still worth
      // flagging but at slightly lower confidence via hasMeaningfulChildContent.
      const confidence = el.hasMeaningfulChildContent ? 0.95 : 0.75;

      candidates.push({
        category: "accessibility",
        issueType: "missing-accessible-name",
        title: `${el.tagName === "button" ? "Button" : "Link"} has no accessible name`,
        description:
          "This interactive element has no text content, aria-label, aria-labelledby, title, or labeled child image — screen reader users cannot tell what it does.",
        severity: "medium",
        confidence,
        element: {
          selector: el.selector,
          tagName: el.tagName,
          boundingBox: el.boundingBox ?? undefined,
        },
        evidence: {
          measuredValue: "accessible name is empty",
        },
        suggestedFix:
          "Add visible text, an aria-label describing the action (e.g. aria-label=\"Close menu\"), or alt text on an icon image inside the control.",
        detector: { id: "missing-accessible-name-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `missing-accessible-name:${el.selector}`,
      });
    }

    return candidates;
  },
};
