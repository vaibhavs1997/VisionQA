# Vision coverage checklist

Maps product goals to the current **ui-quality-platform** implementation. Update this when detectors or limits change.

## User goals vs. implementation

| Goal | Status | Detectors / capability | Known limits |
|------|--------|------------------------|--------------|
| Broken links | **Partial → improved** | `broken-link-v1` | Sampled links only; cap configurable per project (`settings.maxLinksToCheck`, default 30); scope `internal` / `external` / `all` |
| HTTP 404 on assets | **Yes** | `failed-resource-v1`, `broken-image-v1` | Network log from page load |
| 404 on navigation | **Partial** | `broken-link-v1`, document `statusCode`, `soft-404-v1` | Soft 404 is heuristic (title/body patterns) |
| Redirect issues | **Yes** | `navigation-redirect-v1` | Chain from main-document redirects; canonical mismatch when `<link rel="canonical">` present |
| Text / element overlap | **Yes** | `element-overlap-v1`, `fully-obscured-interactive-element-v1` | AI optional on ambiguous overlap |
| Crawler / SEO (single page) | **Strong** | `meta-tags-v1`, `open-graph-tags-v1`, `robots-and-sitemap-v1`, `blocked-critical-resource-v1` | Desktop viewport only for head/SEO |
| robots.txt | **Yes** | `robots-and-sitemap-v1` | Simplified robots parser |
| Whole-site crawl | **Yes** | `packages/crawler` + `crawlMode` on scans | Bounded BFS or sitemap; `maxPages` cap |
| Multi-viewport layout | **Yes** | Layout detectors + `responsive-delta` | SEO/link/nav issues deduped globally across viewports |
| Accessibility (custom) | **Broad** | 12+ a11y-related detectors | Not a full WCAG substitute |
| Accessibility (axe) | **Optional** | `axe-violations-v1` when `runAxe` enabled | Chromium + axe-core in page |
| Visual regression | **Optional** | `visual-regression-v1` vs previous scan screenshot | Per viewport, project opt-in |
| “Every possible UI issue” | **Out of scope** | 33+ deterministic detectors + narrow AI | Use profiles + crawl + integrations |

## Detector registry (33 core + 2 optional)

See [packages/detectors/src/registry.ts](../packages/detectors/src/registry.ts) and [OPTIONAL_DETECTORS](../packages/detectors/src/optional-registry.ts) for axe and visual regression.

## Scan modes

| Mode | Description |
|------|-------------|
| `single` | One URL (default) |
| `sitemap` | URLs from declared sitemap (capped) |
| `bfs` | Same-origin crawl from entry URL (capped) |

## Project settings (`projects.settings` JSON)

| Field | Default | Purpose |
|-------|---------|---------|
| `maxLinksToCheck` | `30` | Link reachability sample size |
| `linkCheckScope` | `all` | `internal`, `external`, or `all` |
| `runAxe` | `false` | Run axe-core after collection |
| `visualRegression` | `false` | Compare to previous completed scan |

## Remaining product gaps (not detection)

- Billing (Stripe), SSO, Jira/Linear, full S3 production verification — see [docs/STAGING_VERIFICATION.md](./STAGING_VERIFICATION.md) and [docs/GROWTH_INTEGRATIONS.md](./GROWTH_INTEGRATIONS.md).
