import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const CRITICAL_RESOURCE_TYPES = new Set(["stylesheet", "script"]);

/**
 * Cross-references robots.txt Disallow rules against the CSS/JS this
 * page actually loaded. A path disallowed for crawlers doesn't stop the
 * page rendering for a real user's browser (which ignores robots.txt
 * entirely) — but Googlebot's renderer respects it, so a disallowed
 * stylesheet or script means Google's rendered/indexed view of the page
 * can look meaningfully broken even though every human visitor sees it
 * fine. This is a well-documented, easy-to-miss SEO footgun (usually
 * from an overly broad `Disallow: /assets/` or `Disallow: /wp-includes/`
 * rule written without checking what actually lives under that path).
 *
 * Uses simple path-prefix matching against Disallow rules — not a full
 * robots.txt wildcard/`$`-anchor matcher — consistent with the
 * intentionally-simplified parser in page-context-collector.ts.
 */
export const blockedCriticalResourceDetector: Detector = {
  id: "blocked-critical-resource-v1",
  version: "1.0.0",
  category: "seo",
  requires: ["network"],
  run(context: PageContext): IssueCandidate[] {
    if (context.scan.viewport.name !== "desktop") return [];

    const disallowRules = context.page.seo?.robotsTxt.disallowRules ?? [];
    if (disallowRules.length === 0) return [];

    const candidates: IssueCandidate[] = [];
    const seen = new Set<string>();

    for (const resource of context.resources) {
      if (!CRITICAL_RESOURCE_TYPES.has(resource.resourceType)) continue;

      let pathname: string;
      try {
        pathname = new URL(resource.url).pathname;
      } catch {
        continue;
      }

      const matchedRule = disallowRules.find((rule) => rule && pathname.startsWith(rule));
      if (!matchedRule || seen.has(resource.url)) continue;
      seen.add(resource.url);

      candidates.push({
        category: "seo",
        issueType: "blocked-critical-resource",
        title: `robots.txt blocks a ${resource.resourceType} this page depends on to render`,
        description: `${resource.url} matches the Disallow rule "${matchedRule}" in robots.txt. Real browsers ignore robots.txt and load it fine, but Googlebot's renderer respects it — its rendered view of this page may be missing this ${resource.resourceType}'s styling/behavior entirely.`,
        severity: "high",
        confidence: 0.7,
        evidence: { measuredValue: resource.url, raw: { disallowRule: matchedRule, resourceType: resource.resourceType } },
        suggestedFix: `Narrow the Disallow rule "${matchedRule}" in robots.txt so it doesn't cover assets the page needs to render correctly.`,
        detector: { id: "blocked-critical-resource-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `blocked-critical-resource:${matchedRule}`,
      });
    }

    return candidates;
  },
};
