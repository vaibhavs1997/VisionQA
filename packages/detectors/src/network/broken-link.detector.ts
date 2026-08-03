import { PageContext, IssueCandidate } from "@ui-quality/shared";
import { Detector } from "../types";

/**
 * Reads `context.page.linkChecks` — reachability results for a capped
 * sample of the page's unique `<a href>` targets, fetched once at
 * collection time (see `collectLinkChecks` in
 * `packages/scanner-core/src/collector/page-context-collector.ts`).
 *
 * This detector itself stays a plain synchronous function over already-
 * assembled data, same as every other detector — the network calls
 * already happened before the detector ever runs, so this is just
 * matching each `<a>` element back to its check result and reporting
 * the ones that came back broken. A link whose target isn't present in
 * `linkChecks` at all was simply outside the sampled cap, not confirmed
 * working, so it's silently skipped rather than assumed fine.
 * A link's reachability doesn't vary by viewport, and (same as the SEO
 * detectors) issues are deduplicated within a single viewport's
 * candidates, not across a scan's three viewports — so without gating
 * to one viewport, the same broken link would be reported three times
 * over.
 */
export const brokenLinkDetector: Detector = {
  id: "broken-link-v1",
  version: "1.0.0",
  category: "network",
  requires: ["dom", "network"],
  run(context: PageContext): IssueCandidate[] {
    if (context.scan.viewport.name !== "desktop") return [];

    const candidates: IssueCandidate[] = [];
    const linkChecks = context.page.linkChecks;
    if (!linkChecks || linkChecks.length === 0) return candidates;

    const checkByUrl = new Map(linkChecks.map((check) => [check.url, check]));
    const seenSignatures = new Set<string>();

    for (const el of context.elements) {
      if (el.tagName !== "a" || !el.isVisible) continue;
      const href = el.attributes.href;
      if (!href) continue;

      let resolved: string;
      try {
        resolved = new URL(href, context.page.finalUrl).toString();
      } catch {
        continue;
      }

      const check = checkByUrl.get(resolved);
      if (!check || check.ok) continue;

      // One issue per broken destination URL, not per link element — the
      // same broken link often appears in a header AND a footer, and
      // that's one root cause, not two independent defects.
      const signature = `broken-link:${resolved}`;
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);

      const isClientError = check.status !== undefined && check.status >= 400 && check.status < 500;
      candidates.push({
        category: "network",
        issueType: "broken-link",
        title: check.status ? `Link returns HTTP ${check.status}` : "Link target is unreachable",
        description: `This link points to ${resolved}, which ${
          check.status
            ? `responded with HTTP ${check.status}${isClientError ? " (not found / not permitted)" : " (server error)"}`
            : `could not be reached${check.error ? ` (${check.error})` : ""}`
        }.`,
        severity: "high",
        confidence: 0.8,
        element: { selector: el.selector, tagName: el.tagName, text: el.visibleText?.slice(0, 80) },
        evidence: {
          measuredValue: check.status ? `HTTP ${check.status}` : check.error ?? "unreachable",
          raw: { url: resolved },
        },
        suggestedFix: "Update the link to a working destination, or remove it if the target page no longer exists.",
        detector: { id: "broken-link-v1", version: "1.0.0", source: "deterministic" },
        rootCauseSignature: signature,
      });
    }

    return candidates;
  },
};
