import type { ScanInsights } from "@ui-quality/shared";

export function ScanInsightsPanel({ insights }: { insights?: ScanInsights | Record<string, unknown> | null }) {
  if (!insights || Object.keys(insights).length === 0) return null;
  const data = insights as ScanInsights;

  return (
    <div className="viewfinder rounded-lg border border-line bg-surface p-6 text-sm text-ink">
      <span className="vf-br" />
      <span className="vf-bl" />
      <p className="label-eyebrow mb-3">Scan coverage</p>

      {data.navigation && (
        <div className="mb-4">
          <p className="font-medium text-ink">Navigation</p>
          <p className="mt-1 font-mono text-xs text-ink-faint">
            {data.navigation.requestedUrl} → {data.navigation.finalUrl}
          </p>
          <p className="mt-1 text-ink-faint">
            Redirect hops: {data.navigation.redirectCount}
            {data.navigation.crossDomainRedirect ? " · cross-domain" : ""}
          </p>
        </div>
      )}

      {data.linkCheck && (
        <div className="mb-4">
          <p className="font-medium text-ink">Link checks</p>
          <p className="mt-1 text-ink-faint">
            Sampled {data.linkCheck.sampledLinkCount} of {data.linkCheck.eligibleLinkCount} eligible links (cap{" "}
            {data.linkCheck.maxLinksToCheck}, scope {data.linkCheck.scope})
          </p>
        </div>
      )}

      {data.crawl && data.crawl.mode !== "single" && (
        <div className="mb-4">
          <p className="font-medium text-ink">Crawl ({data.crawl.mode})</p>
          <p className="mt-1 text-ink-faint">
            {data.crawl.pagesCompleted}/{data.crawl.pagesPlanned} pages scanned
          </p>
        </div>
      )}

      {data.detectorChecklist && (
        <div>
          <p className="font-medium text-ink">Detectors ({data.detectorChecklist.length})</p>
          <p className="mt-1 text-xs text-ink-faint">Full registry ran on each page viewport.</p>
        </div>
      )}
    </div>
  );
}
