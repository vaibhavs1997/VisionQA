import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

const THIRD_PARTY_HOST_PATTERNS = [
  /google-analytics\.com$/i,
  /googletagmanager\.com$/i,
  /doubleclick\.net$/i,
  /facebook\.net$/i,
  /hotjar\.com$/i,
  /segment\.(io|com)$/i,
  /sentry\.io$/i,
  /intercom\.io$/i,
  /stripe\.com$/i,
];

function isThirdPartyLocation(location: string | undefined, pageHost: string): boolean {
  if (!location) return false;
  try {
    const host = new URL(location).hostname;
    if (host === pageHost) return false;
    // Cross-origin alone does NOT make something third-party — a site's
    // own CDN/assets subdomain is still "first-party" for this purpose.
    // Only suppress errors that resolve to a recognized tracker/analytics/
    // support-widget domain.
    return THIRD_PARTY_HOST_PATTERNS.some((p) => p.test(host));
  } catch {
    return false;
  }
}

/**
 * Flags first-party console "error"-level messages — deliberately
 * excludes anything whose source location resolves to a known
 * third-party domain (analytics/ads/support-widget scripts routinely log
 * noisy errors unrelated to this page's own UI). Kept at moderate
 * confidence since a console error correlating with an actual visible
 * rendering defect is Phase 2 territory (cross-referencing with other
 * detector output); Phase 1 surfaces the raw first-party signal only.
 */
export const consoleUiErrorDetector: Detector = {
  id: "console-ui-error-v1",
  version: "1.0.0",
  category: "technical",
  requires: ["console"],
  run(context: PageContext): IssueCandidate[] {
    const candidates: IssueCandidate[] = [];
    let pageHost = "";
    try {
      pageHost = new URL(context.page.finalUrl).hostname;
    } catch {
      pageHost = "";
    }

    const seenMessages = new Set<string>();

    for (const msg of context.consoleMessages) {
      if (msg.type !== "error") continue;
      if (isThirdPartyLocation(msg.location, pageHost)) continue;

      const dedupeKey = msg.text.slice(0, 200);
      if (seenMessages.has(dedupeKey)) continue;
      seenMessages.add(dedupeKey);

      candidates.push({
        category: "technical",
        issueType: "console-ui-error",
        title: "First-party JavaScript error in console",
        description:
          "A JavaScript error was thrown by first-party code. This may or may not affect rendering — treat as a signal worth investigating rather than a confirmed visual defect.",
        severity: "low",
        confidence: 0.6,
        evidence: {
          consoleMessage: dedupeKey,
          measuredValue: msg.location,
        },
        suggestedFix: "Check the browser console/stack trace for the root cause of this error.",
        detector: { id: "console-ui-error-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: `console-ui-error:${dedupeKey}`,
      });
    }

    return candidates;
  },
};
