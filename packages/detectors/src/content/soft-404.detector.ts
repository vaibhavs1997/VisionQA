import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const SOFT_404_TITLE = /\b(404|not found|page not found|doesn't exist|does not exist)\b/i;
const SOFT_404_BODY =
  /\b(404 error|page not found|we couldn't find|we could not find|this page doesn't exist|this page does not exist)\b/i;

/**
 * Flags pages that return HTTP 200 but read like error pages — a common
 * "soft 404" pattern that hurts SEO and confuses users.
 */
export const soft404Detector: Detector = {
  id: "soft-404-v1",
  version: "1.0.0",
  category: "content",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    if (context.scan.viewport.name !== "desktop") return [];
    const status = context.page.navigation?.documentStatusCode ?? context.page.statusCode;
    if (status !== undefined && status >= 400) return [];

    const title = context.page.title ?? "";
    const bodyText = context.elements
      .filter((el) => el.tagName === "body" || el.tagName === "main" || el.tagName === "h1")
      .map((el) => el.visibleText ?? el.text ?? "")
      .join(" ")
      .slice(0, 2000);

    const titleHit = SOFT_404_TITLE.test(title);
    const bodyHit = SOFT_404_BODY.test(bodyText);
    if (!titleHit && !bodyHit) return [];

    return [
      {
        category: "content",
        issueType: "soft-404",
        title: "Page content looks like a 404 error",
        description: `The document returned a success status but the title/body contain error-page language (title: "${title.slice(0, 120)}"). This is often a soft 404 — crawlers may treat it as a missing page anyway.`,
        severity: "high",
        confidence: titleHit && bodyHit ? 0.9 : 0.75,
        evidence: {
          measuredValue: title,
          raw: { titleMatch: titleHit, bodyMatch: bodyHit, httpStatus: status ?? 200 },
        },
        suggestedFix: "Return a real HTTP 404/410 for missing pages, or replace placeholder error copy with real content.",
        detector: { id: "soft-404-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `soft-404:${context.page.finalUrl}`,
      },
    ];
  },
};
