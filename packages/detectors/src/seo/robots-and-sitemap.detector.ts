import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * robots.txt and sitemap reachability — these require the collector's
 * own fetch of a different URL entirely (see collectSeoSnapshot in
 * page-context-collector.ts), so this detector just reads the
 * already-fetched result rather than doing any network I/O itself,
 * keeping it a pure function like every other detector.
 *
 * Same single-viewport guard as the other seo detectors: robots.txt is
 * one file for the whole origin, not per-viewport.
 */
export const robotsAndSitemapDetector: Detector = {
  id: "robots-and-sitemap-v1",
  version: "1.0.0",
  category: "seo",
  requires: ["dom", "network"],
  run(context: PageContext): IssueCandidate[] {
    if (context.scan.viewport.name !== "desktop") return [];

    const candidates: IssueCandidate[] = [];
    const robotsTxt = context.page.seo?.robotsTxt;
    // If the check never ran (e.g. the URL guard rejected it, or the
    // benchmark harness's localhost fixtures), we genuinely don't know —
    // report nothing rather than a false "missing" claim.
    if (!robotsTxt?.checked) return candidates;

    if (!robotsTxt.accessible) {
      candidates.push({
        category: "seo",
        issueType: "robots-txt-inaccessible",
        title: "robots.txt is missing or inaccessible",
        description: `/robots.txt returned ${robotsTxt.statusCode ?? "no response"}. Its absence isn't strictly an error — crawlers treat a missing robots.txt as "everything allowed" — but most production sites intentionally serve one to declare their sitemap and control crawl behavior, so this is usually a real gap rather than a deliberate choice.`,
        severity: "low",
        confidence: 0.7,
        evidence: { measuredValue: String(robotsTxt.statusCode ?? "no response") },
        suggestedFix: "Serve a robots.txt at the site root declaring crawl rules and the sitemap location.",
        detector: { id: "robots-and-sitemap-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: "robots-txt-inaccessible",
      });
      return candidates; // nothing further to check without a reachable robots.txt
    }

    if (robotsTxt.sitemapUrls.length === 0) {
      candidates.push({
        category: "seo",
        issueType: "sitemap-not-declared",
        title: "robots.txt does not declare a Sitemap",
        description:
          "robots.txt was reachable but has no \"Sitemap:\" line. Declaring your sitemap here is the standard way search engines discover it without you having to manually submit it in each search console.",
        severity: "low",
        confidence: 0.65,
        evidence: { measuredValue: "no Sitemap: directive found" },
        suggestedFix: "Add a Sitemap: https://yoursite.com/sitemap.xml line to robots.txt.",
        detector: { id: "robots-and-sitemap-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: "sitemap-not-declared",
      });
    } else if (context.page.seo?.sitemap && !context.page.seo.sitemap.accessible) {
      candidates.push({
        category: "seo",
        issueType: "sitemap-inaccessible",
        title: "Declared sitemap is not reachable",
        description: `robots.txt declares a sitemap at ${context.page.seo.sitemap.url}, but fetching it returned ${
          context.page.seo.sitemap.statusCode ?? "no response"
        }. A broken sitemap link means crawlers relying on it for discovery get nothing.`,
        severity: "medium",
        confidence: 0.75,
        evidence: { measuredValue: String(context.page.seo.sitemap.statusCode ?? "no response"), raw: { sitemapUrl: context.page.seo.sitemap.url } },
        suggestedFix: "Fix the sitemap URL in robots.txt, or make sure the sitemap file is actually served at that path.",
        detector: { id: "robots-and-sitemap-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: "sitemap-inaccessible",
      });
    }

    return candidates;
  },
};
