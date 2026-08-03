import {
  PageContext,
  Viewport,
  ElementSnapshot,
  ImageSnapshot,
  NetworkResource,
  ConsoleMessage,
  FontFaceSnapshot,
  SvgSnapshot,
  SeoSnapshot,
} from "@ui-quality/shared";
import { BrowserAdapter } from "../browser/browser-adapter";
import { assertUrlIsSafe } from "../security/url-security-guard";

/**
 * Best-effort robots.txt parser: finds the `User-agent: *` group (falling
 * back to the first group in the file if there's no wildcard group) and
 * returns its Disallow paths, plus every Sitemap: line in the file
 * regardless of which group it's under (Sitemap directives aren't
 * per-agent). This is intentionally NOT a full RFC 9309 implementation —
 * no group-specificity resolution, no wildcard/`$`-anchor path matching —
 * just enough to catch the common "everything important is blocked"
 * and "no sitemap declared" cases this detector pack cares about.
 */
function parseRobotsTxt(body: string): { disallowRules: string[]; sitemapUrls: string[] } {
  const sitemapUrls: string[] = [];
  const groups: { agent: string; disallows: string[] }[] = [];
  let current: { agent: string; disallows: string[] } | null = null;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      current = { agent: value.toLowerCase(), disallows: [] };
      groups.push(current);
    } else if (key === "disallow" && current && value) {
      current.disallows.push(value);
    } else if (key === "sitemap" && value) {
      sitemapUrls.push(value);
    }
  }

  const wildcardGroup = groups.find((g) => g.agent === "*");
  const disallowRules = (wildcardGroup ?? groups[0])?.disallows ?? [];
  return { disallowRules, sitemapUrls };
}

export interface CollectPageContextOptions {
  scanId: string;
  requestedUrl: string;
  viewport: Viewport;
  outDir: string;
  navigationTimeoutMs?: number;
  /**
   * Bypasses the URL Security Guard. NEVER set this for a real scan — it
   * exists solely so the internal benchmark harness can point the exact
   * same pipeline at localhost-served fixture pages, since localhost is
   * (correctly) blocked for real scans per the Phase 0 security spec.
   */
  skipUrlGuardForBenchmarkFixturesOnly?: boolean;
}

/**
 * Orchestrates a single-viewport page collection: validates the URL,
 * drives the Browser Adapter, and normalizes the raw browser output into
 * the stable PageContext contract that every detector consumes. This is
 * the one place browser execution and the UI Intelligence Engine meet —
 * everything below here is "infrastructure," everything above is "product."
 */
export async function collectPageContext(
  adapter: BrowserAdapter,
  options: CollectPageContextOptions
): Promise<PageContext> {
  const { scanId, requestedUrl, viewport, outDir } = options;
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000;

  // Fail closed before a browser is ever opened — except for the internal
  // benchmark harness, which deliberately targets localhost-served fixtures.
  if (!options.skipUrlGuardForBenchmarkFixturesOnly) {
    await assertUrlIsSafe(requestedUrl);
  }

  await adapter.open();

  const startedAt = new Date().toISOString();
  const navResult = await adapter.navigate(requestedUrl, viewport, navigationTimeoutMs);
  const raw = await adapter.collectPageData();
  const screenshots = await adapter.captureScreenshots(String(viewport.name), outDir);
  const userAgent = await adapter.getUserAgent();

  const elements: ElementSnapshot[] = (raw.elements as any[]).map((e) => ({
    id: e.id,
    selector: e.selector,
    tagName: e.tagName,
    role: e.role,
    text: e.text,
    visibleText: e.visibleText,
    attributes: e.attributes,
    boundingBox: e.boundingBox,
    viewportIntersection: e.viewportIntersection,
    isVisible: e.isVisible,
    isInteractive: e.isInteractive,
    ariaHidden: e.ariaHidden,
    accessibleName: e.accessibleName,
    hasMeaningfulChildContent: e.hasMeaningfulChildContent,
    formFieldInfo: e.formFieldInfo,
    effectiveBackgroundColor: e.effectiveBackgroundColor,
    hasUnresolvedBackground: e.hasUnresolvedBackground,
    isInsideHorizontalScrollContainer: e.isInsideHorizontalScrollContainer,
    computedStyle: e.computedStyle,
    layoutMetrics: e.layoutMetrics,
  }));

  const images: ImageSnapshot[] = (raw.images as any[]).map((img) => {
    const matchedResource = navResult.resources.find(
      (r) => r.url === img.currentSrc || r.url === img.src
    );
    return {
      elementId: img.elementId,
      selector: img.selector,
      src: img.src,
      currentSrc: img.currentSrc,
      alt: img.alt,
      role: img.role,
      ariaHidden: img.ariaHidden,
      isVisible: img.isVisible,
      boundingBox: img.boundingBox,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      resourceStatus: matchedResource?.status,
      resourceFailure: matchedResource?.failureText,
    };
  });

  const resources: NetworkResource[] = navResult.resources;
  const consoleMessages: ConsoleMessage[] = navResult.consoleMessages;
  const fonts: FontFaceSnapshot[] = (raw.fonts as any[]) || [];
  const svgs: SvgSnapshot[] = (raw.svgs as any[]) || [];
  const rawSeoMeta = (raw as any).seoMeta ?? {};

  const seo = await collectSeoSnapshot(adapter, navResult.finalUrl, rawSeoMeta, options);

  const pageContext: PageContext = {
    scan: {
      scanId,
      requestedUrl,
      startedAt,
      browser: "chromium",
      viewport,
      userAgent,
    },
    page: {
      finalUrl: navResult.finalUrl,
      title: navResult.title,
      statusCode: navResult.statusCode,
      loadState: navResult.loadState,
      documentWidth: raw.documentWidth,
      documentHeight: raw.documentHeight,
      viewportWidth: raw.viewportWidth,
      viewportHeight: raw.viewportHeight,
      scrollWidth: raw.scrollWidth,
      scrollHeight: raw.scrollHeight,
      hasHorizontalScroll: raw.hasHorizontalScroll,
      seo,
    },
    elements,
    images,
    resources,
    consoleMessages,
    screenshots,
    fonts,
    svgs,
  };

  return pageContext;
}

/**
 * robots.txt/sitemap reachability is a check about a *different resource*
 * than the page itself, so it can't come from the in-page collection
 * script — it needs its own fetch via the adapter. Runs once per
 * `collectPageContext` call (i.e. once per viewport, same as everything
 * else here) — robots.txt is tiny and this keeps the collector's
 * per-viewport-independence property rather than adding cross-viewport
 * shared state, at the cost of fetching the same tiny file up to 3x per
 * scan. Never throws: a failure here should reduce to "seo.robotsTxt not
 * accessible," not take down the whole scan.
 */
async function collectSeoSnapshot(
  adapter: BrowserAdapter,
  finalUrl: string,
  rawSeoMeta: any,
  options: CollectPageContextOptions
): Promise<SeoSnapshot> {
  const seo: SeoSnapshot = {
    metaDescription: rawSeoMeta.metaDescription,
    metaRobots: rawSeoMeta.metaRobots,
    canonicalUrl: rawSeoMeta.canonicalUrl,
    openGraph: rawSeoMeta.openGraph ?? {},
    robotsTxt: { checked: false, accessible: false, sitemapUrls: [], disallowRules: [] },
  };

  try {
    const robotsUrl = new URL("/robots.txt", finalUrl).toString();
    if (!options.skipUrlGuardForBenchmarkFixturesOnly) await assertUrlIsSafe(robotsUrl);
    const result = await adapter.fetchExternal(robotsUrl);
    seo.robotsTxt.checked = true;
    seo.robotsTxt.accessible = result.ok;
    seo.robotsTxt.statusCode = result.status;

    if (result.ok && result.body) {
      const parsed = parseRobotsTxt(result.body);
      seo.robotsTxt.disallowRules = parsed.disallowRules;
      seo.robotsTxt.sitemapUrls = parsed.sitemapUrls;

      const firstSitemap = parsed.sitemapUrls[0];
      if (firstSitemap) {
        try {
          if (!options.skipUrlGuardForBenchmarkFixturesOnly) await assertUrlIsSafe(firstSitemap);
          const sitemapResult = await adapter.fetchExternal(firstSitemap);
          seo.sitemap = { url: firstSitemap, accessible: sitemapResult.ok, statusCode: sitemapResult.status };
        } catch {
          seo.sitemap = { url: firstSitemap, accessible: false };
        }
      }
    }
  } catch {
    // robots.txt fetch itself failed the URL guard or errored outright —
    // seo.robotsTxt.checked stays false, which the detectors read as
    // "we couldn't determine this" rather than "confirmed missing."
  }

  return seo;
}
