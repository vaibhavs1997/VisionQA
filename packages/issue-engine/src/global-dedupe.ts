import { UiIssue } from "@ui-quality/shared";

/** Issue types that are invariant across viewport dimensions — keep one copy. */
const VIEWPORT_INVARIANT_TYPES = new Set([
  "broken-link",
  "meta-description-missing",
  "meta-description-too-short",
  "meta-robots-noindex",
  "canonical-missing",
  "open-graph-missing",
  "robots-txt-missing",
  "robots-txt-inaccessible",
  "sitemap-not-declared",
  "sitemap-inaccessible",
  "blocked-critical-resource",
  "cross-domain-redirect",
  "redirect-chain-long",
  "canonical-final-url-mismatch",
  "document-http-error",
  "soft-404",
]);

const VIEWPORT_INVARIANT_PREFIXES = ["meta-", "open-graph-", "robots-", "sitemap-", "og-"];

function isViewportInvariant(issue: UiIssue): boolean {
  if (VIEWPORT_INVARIANT_TYPES.has(issue.issueType)) return true;
  if (issue.category === "seo") return true;
  return VIEWPORT_INVARIANT_PREFIXES.some((p) => issue.issueType.startsWith(p));
}

/**
 * After per-viewport assembly, collapse duplicate root causes that were
 * reported once per viewport (SEO, links, navigation).
 */
export function deduplicateViewportInvariantIssues(issues: UiIssue[]): UiIssue[] {
  const invariantKept = new Map<string, UiIssue>();
  const result: UiIssue[] = [];

  for (const issue of issues) {
    if (!isViewportInvariant(issue)) {
      result.push(issue);
      continue;
    }
    const key = issue.rootCauseSignature ?? `${issue.issueType}:${issue.url}`;
    const existing = invariantKept.get(key);
    if (!existing) {
      invariantKept.set(key, issue);
    } else if (existing.viewport.name !== "desktop" && issue.viewport.name === "desktop") {
      invariantKept.set(key, issue);
    }
  }

  result.push(...invariantKept.values());
  return result;
}
