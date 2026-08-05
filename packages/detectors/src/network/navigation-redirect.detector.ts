import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Surfaces main-document redirect behavior: cross-domain hops, long chains,
 * and canonical URL mismatches. Desktop-only — navigation does not vary by
 * viewport width.
 */
export const navigationRedirectDetector: Detector = {
  id: "navigation-redirect-v1",
  version: "1.0.0",
  category: "network",
  requires: ["dom", "network"],
  run(context: PageContext): IssueCandidate[] {
    if (context.scan.viewport.name !== "desktop") return [];
    const nav = context.page.navigation;
    if (!nav) return [];

    const candidates: IssueCandidate[] = [];

    if (nav.crossDomainRedirect) {
      candidates.push({
        category: "network",
        issueType: "cross-domain-redirect",
        title: "Entry URL redirects to a different domain",
        description: `The scan started at ${nav.requestedUrl} but the browser landed on ${nav.finalUrl} (${nav.redirectCount} redirect hop(s)). Unexpected cross-domain redirects can break analytics, SEO canonical signals, and user trust.`,
        severity: "medium",
        confidence: 0.9,
        evidence: {
          measuredValue: nav.finalUrl,
          expectedValue: nav.requestedUrl,
          raw: { redirectChain: nav.redirectChain },
        },
        suggestedFix: "Confirm the redirect is intentional; use same-site redirects where possible and update canonical/link tags to match the final URL.",
        detector: { id: "navigation-redirect-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `cross-domain:${nav.requestedUrl}->${nav.finalUrl}`,
      });
    }

    if (nav.redirectCount >= 3) {
      candidates.push({
        category: "network",
        issueType: "redirect-chain-long",
        title: "Long redirect chain detected",
        description: `The main document took ${nav.redirectCount} redirect hop(s) before reaching ${nav.finalUrl}. Long chains slow page loads and can confuse crawlers.`,
        severity: "low",
        confidence: 0.85,
        evidence: { raw: { redirectChain: nav.redirectChain, redirectCount: nav.redirectCount } },
        suggestedFix: "Collapse redirect chains to a single hop where possible.",
        detector: { id: "navigation-redirect-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `redirect-chain:${nav.redirectChain.join("->")}`,
      });
    }

    if (nav.canonicalMismatch && nav.canonicalUrl) {
      candidates.push({
        category: "seo",
        issueType: "canonical-final-url-mismatch",
        title: "Canonical URL does not match the final page URL",
        description: `The page declares canonical ${nav.canonicalUrl} but loaded as ${nav.finalUrl}. Search engines may index the wrong URL.`,
        severity: "high",
        confidence: 0.88,
        evidence: {
          measuredValue: nav.finalUrl,
          expectedValue: nav.canonicalUrl,
        },
        suggestedFix: "Align redirects and the <link rel=\"canonical\"> tag so they point to the same final URL.",
        detector: { id: "navigation-redirect-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `canonical-mismatch:${nav.canonicalUrl}`,
      });
    }

    if (nav.documentStatusCode && nav.documentStatusCode >= 400) {
      candidates.push({
        category: "network",
        issueType: "document-http-error",
        title: "Main document returned an HTTP error",
        description: `The scanned page returned HTTP ${nav.documentStatusCode} for ${nav.finalUrl}.`,
        severity: nav.documentStatusCode === 404 ? "critical" : "high",
        confidence: 0.95,
        evidence: { httpStatus: nav.documentStatusCode, measuredValue: String(nav.documentStatusCode) },
        suggestedFix: "Fix the server response or update the URL to a working page.",
        detector: { id: "navigation-redirect-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `document-status:${nav.documentStatusCode}:${nav.finalUrl}`,
      });
    }

    return candidates;
  },
};
