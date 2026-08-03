import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const IDEAL_DESCRIPTION_MIN = 50;
const IDEAL_DESCRIPTION_MAX = 160;

/**
 * On-page SEO/crawler-visibility tags: meta description, meta robots,
 * and the canonical link. Deliberately restricted to properties readable
 * straight off the DOM (no network fetch) — see robots-and-sitemap.detector
 * for the robots.txt/sitemap checks that DO need one.
 *
 * Runs only against the desktop viewport: these tags are viewport-
 * independent (same <head> regardless of screen size), and the pipeline
 * deduplicates within a single viewport's candidates, not across the
 * three viewports of a scan — without this guard, every SEO issue here
 * would be reported three times over, once per viewport.
 */
export const metaTagsDetector: Detector = {
  id: "meta-tags-v1",
  version: "1.0.0",
  category: "seo",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    if (context.scan.viewport.name !== "desktop") return [];

    const candidates: IssueCandidate[] = [];
    const seo = context.page.seo;
    if (!seo) return candidates;

    const description = seo.metaDescription?.trim();
    if (!description) {
      candidates.push({
        category: "seo",
        issueType: "missing-meta-description",
        title: "Page is missing a meta description",
        description:
          "No <meta name=\"description\"> tag was found. Search engines use this to build the snippet shown under your title in search results — without one, they'll auto-generate a snippet from page content, which is often a worse pitch for the click than a written one.",
        severity: "medium",
        confidence: 0.85,
        evidence: { measuredValue: "none" },
        suggestedFix: 'Add <meta name="description" content="..."> with a concise, accurate 50-160 character summary of the page.',
        detector: { id: "meta-tags-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: "missing-meta-description",
      });
    } else if (description.length < IDEAL_DESCRIPTION_MIN || description.length > IDEAL_DESCRIPTION_MAX) {
      candidates.push({
        category: "seo",
        issueType: "meta-description-length",
        title: `Meta description is ${description.length < IDEAL_DESCRIPTION_MIN ? "very short" : "too long"} (${description.length} characters)`,
        description: `Meta descriptions outside roughly ${IDEAL_DESCRIPTION_MIN}-${IDEAL_DESCRIPTION_MAX} characters tend to either look thin or get truncated with "..." in search results.`,
        severity: "low",
        confidence: 0.6,
        evidence: { measuredValue: `${description.length} characters`, expectedValue: `${IDEAL_DESCRIPTION_MIN}-${IDEAL_DESCRIPTION_MAX} characters` },
        suggestedFix: `Rewrite the meta description to land within ${IDEAL_DESCRIPTION_MIN}-${IDEAL_DESCRIPTION_MAX} characters.`,
        detector: { id: "meta-tags-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: "meta-description-length",
      });
    }

    const robotsMeta = seo.metaRobots?.toLowerCase() ?? "";
    if (robotsMeta.includes("noindex")) {
      candidates.push({
        category: "seo",
        issueType: "noindex-robots-meta",
        title: 'Page has <meta name="robots" content="noindex"> — search engines will not index it',
        description:
          "This page explicitly tells search engines not to index it. That's correct for admin/internal pages, but is a critical, often-accidental mistake if this is meant to be a real public page — it's a common leftover from staging/pre-launch config.",
        severity: "critical",
        confidence: 0.7, // deliberately not higher — noindex is often intentional; AI could review page content vs. intent in a future pass
        evidence: { measuredValue: seo.metaRobots ?? "" },
        suggestedFix: 'Remove "noindex" from the robots meta tag if this page is meant to be publicly discoverable.',
        detector: { id: "meta-tags-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: "noindex-robots-meta",
      });
    }

    if (!seo.canonicalUrl) {
      candidates.push({
        category: "seo",
        issueType: "missing-canonical-tag",
        title: "Page is missing a canonical tag",
        description:
          "No <link rel=\"canonical\"> tag was found. Without one, search engines have to guess which URL variant (with/without trailing slash, query params, http/https) is the \"real\" one to index — risking duplicate-content dilution across variants.",
        severity: "low",
        confidence: 0.65,
        evidence: { measuredValue: "none" },
        suggestedFix: '<link rel="canonical" href="..."> pointing at the preferred URL for this page.',
        detector: { id: "meta-tags-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: "missing-canonical-tag",
      });
    }

    return candidates;
  },
};
