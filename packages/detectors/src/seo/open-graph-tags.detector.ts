import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * The three Open Graph tags that actually control how a link preview
 * renders when shared (Slack, iMessage, Facebook, LinkedIn, and most
 * chat apps all read these) — title/description/image. og:url and
 * og:type exist but their absence doesn't visibly break a preview the
 * way missing title/description/image does, so they're not checked here.
 *
 * Same single-viewport guard as meta-tags-v1, for the same reason: these
 * are <head>-level, viewport-independent tags.
 */
export const openGraphTagsDetector: Detector = {
  id: "open-graph-tags-v1",
  version: "1.0.0",
  category: "seo",
  requires: ["dom"],
  run(context: PageContext): IssueCandidate[] {
    if (context.scan.viewport.name !== "desktop") return [];

    const seo = context.page.seo;
    if (!seo) return [];

    const missing: string[] = [];
    if (!seo.openGraph.title?.trim()) missing.push("og:title");
    if (!seo.openGraph.description?.trim()) missing.push("og:description");
    if (!seo.openGraph.image?.trim()) missing.push("og:image");

    if (missing.length === 0) return [];

    return [
      {
        category: "seo",
        issueType: "missing-open-graph-tags",
        title: `Missing Open Graph tag${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
        description: `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not set. These control how this page's link preview looks when shared on Slack, iMessage, LinkedIn, and most social platforms — without them, shared links show a blank or generic preview instead of your page's title/summary/image.`,
        severity: missing.includes("og:image") ? "medium" : "low",
        confidence: 0.75,
        evidence: { raw: { missing } },
        suggestedFix: `Add ${missing.map((m) => `<meta property="${m}" content="...">`).join(", ")} to the page <head>.`,
        detector: { id: "open-graph-tags-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: "missing-open-graph-tags",
      },
    ];
  },
};
