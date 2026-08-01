import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const UI_CRITICAL_TYPES = new Set(["stylesheet", "script", "font"]);
const KNOWN_ANALYTICS_HOSTS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "facebook.net",
  "hotjar.com",
  "segment.io",
  "mixpanel.com",
];

function isAnalyticsResource(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return KNOWN_ANALYTICS_HOSTS.some((known) => host.endsWith(known));
  } catch {
    return false;
  }
}

/**
 * Flags any non-2xx/3xx response or requestfailed event, excluding the
 * document itself (handled implicitly — a failed document load surfaces
 * via page.loadState). Groups by URL so a resource that fails once still
 * only produces one candidate (the Deduplicator would also catch repeats,
 * but avoiding the duplication here keeps candidate volume down).
 */
export const failedResourceDetector: Detector = {
  id: "failed-resource-v1",
  version: "1.0.0",
  category: "network",
  requires: ["network"],
  run(context: PageContext): IssueCandidate[] {
    const seen = new Set<string>();
    const candidates: IssueCandidate[] = [];

    for (const resource of context.resources) {
      if (resource.ok) continue;
      if (resource.resourceType === "document") continue; // handled by page.loadState
      if (seen.has(resource.url)) continue;
      seen.add(resource.url);

      const isAnalytics = isAnalyticsResource(resource.url);
      const isUiCritical = UI_CRITICAL_TYPES.has(resource.resourceType);

      let confidence = 1.0;
      if (isAnalytics) confidence = 0.7;
      else if (resource.status && resource.status === 404) confidence = 0.95;

      let severity: IssueCandidate["severity"] = "medium";
      if (isUiCritical) severity = "high";
      else if (isAnalytics) severity = "low";
      else if (resource.resourceType === "xhr" || resource.resourceType === "fetch") severity = "medium";

      candidates.push({
        category: "network",
        issueType: "failed-resource",
        title: `Failed to load ${resource.resourceType} resource`,
        description: resource.failureText
          ? `Request failed: ${resource.failureText}.`
          : `Resource responded with HTTP ${resource.status}.`,
        severity,
        confidence,
        evidence: {
          resourceUrl: resource.url,
          httpStatus: resource.status,
          measuredValue: resource.failureText ?? String(resource.status),
        },
        suggestedFix: isUiCritical
          ? "This resource affects page rendering directly — verify the URL, CDN configuration, and deployment path."
          : "Verify the endpoint is reachable and returning the expected response.",
        detector: { id: "failed-resource-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `failed-resource:${resource.url}`,
      });
    }

    return candidates;
  },
};
