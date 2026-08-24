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
  LinkCheck,
  LinkCheckMeta,
  PageNavigationMeta,
  FocusIndicatorCheck,
  HoverFeedbackCheck,
  ExpandableToggleCheck,
  DEFAULT_MAX_LINKS_TO_CHECK,
  LinkCheckScope,
} from "@ui-quality/shared";
import { BrowserAdapter } from "../browser/browser-adapter";
import { ScannerNetworkPolicy } from "../security/scanner-network-policy";

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
  networkPolicy?: ScannerNetworkPolicy;
  linkCheck?: {
    maxLinksToCheck?: number;
    scope?: LinkCheckScope;
  };
  /** Run axe-core analysis after DOM collection (desktop viewport only). */
  runAxe?: boolean;
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
  const networkPolicy = options.networkPolicy ?? new ScannerNetworkPolicy();

  // Fail closed before a browser is ever opened — except for the internal
  // benchmark harness, which deliberately targets localhost-served fixtures.
  await networkPolicy.assertAllowed(requestedUrl);

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

  const seo = await collectSeoSnapshot(adapter, navResult.finalUrl, rawSeoMeta, networkPolicy);
  const { checks: linkChecks, meta: linkCheckMeta } = await collectLinkChecks(
    adapter,
    elements,
    navResult.finalUrl,
    options,
    networkPolicy
  );
  const focusIndicatorChecks = await collectFocusIndicatorChecks(adapter, elements, viewport);
  const hoverFeedbackChecks = await collectHoverFeedbackChecks(adapter, elements, viewport);
  const expandableToggleChecks = await collectExpandableToggleChecks(adapter, elements, viewport);

  const navigation =
    viewport.name === "desktop"
      ? buildNavigationMeta(requestedUrl, navResult.finalUrl, navResult, seo?.canonicalUrl)
      : undefined;

  let axeViolations: PageContext["page"]["axeViolations"];
  if (options.runAxe && viewport.name === "desktop" && "runAxeAnalysis" in adapter) {
    axeViolations = await (adapter as { runAxeAnalysis: () => Promise<PageContext["page"]["axeViolations"]> }).runAxeAnalysis();
  }

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
      linkChecks,
      linkCheckMeta,
      navigation,
      axeViolations,
      focusIndicatorChecks,
      hoverFeedbackChecks,
      expandableToggleChecks,
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
  networkPolicy: ScannerNetworkPolicy
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
    await networkPolicy.assertAllowed(robotsUrl);
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
          await networkPolicy.assertAllowed(firstSitemap);
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

// Default cap raised from 15 → 30; override per project via CollectPageContextOptions.
const LINK_CHECK_TIMEOUT_MS = 5000;
const SKIPPABLE_HREF_PREFIXES = ["mailto:", "tel:", "javascript:", "#"];

function buildNavigationMeta(
  requestedUrl: string,
  finalUrl: string,
  navResult: { statusCode?: number; redirectChain?: string[]; redirectCount?: number },
  canonicalUrl?: string
): PageNavigationMeta {
  let requestedHost = "";
  let finalHost = "";
  try {
    requestedHost = new URL(requestedUrl).hostname;
    finalHost = new URL(finalUrl).hostname;
  } catch {
    /* ignore */
  }
  const chain = navResult.redirectChain ?? [requestedUrl, finalUrl];
  let canonicalMismatch = false;
  if (canonicalUrl) {
    try {
      canonicalMismatch = new URL(canonicalUrl).toString() !== new URL(finalUrl).toString();
    } catch {
      canonicalMismatch = false;
    }
  }
  return {
    requestedUrl,
    finalUrl,
    redirectChain: chain,
    redirectCount: navResult.redirectCount ?? Math.max(0, chain.length - 1),
    crossDomainRedirect: requestedHost !== "" && finalHost !== "" && requestedHost !== finalHost,
    canonicalUrl,
    canonicalMismatch,
    documentStatusCode: navResult.statusCode,
  };
}

function linkMatchesScope(resolved: URL, pageOrigin: string, scope: LinkCheckScope): boolean {
  if (scope === "all") return true;
  const isInternal = resolved.origin === pageOrigin;
  return scope === "internal" ? isInternal : !isInternal;
}

/**
 * Checks reachability for a capped sample of unique same-page link
 * targets. Runs through the same URL Security Guard as the main scan
 * target — a link pointing at an internal/private address is exactly the
 * kind of thing the guard exists to catch, so those targets are silently
 * skipped (not flagged as "broken") rather than fetched.
 *
 * Deliberately best-effort and non-blocking: a network hiccup checking
 * one link must never fail the whole scan, so every failure mode here
 * reduces to "this link just wasn't included in the results," which
 * `broken-link-v1` treats as "not sampled" rather than "confirmed OK."
 */
async function collectLinkChecks(
  adapter: BrowserAdapter,
  elements: ElementSnapshot[],
  finalUrl: string,
  options: CollectPageContextOptions,
  networkPolicy: ScannerNetworkPolicy
): Promise<{ checks: LinkCheck[]; meta: LinkCheckMeta }> {
  const maxLinksToCheck = options.linkCheck?.maxLinksToCheck ?? DEFAULT_MAX_LINKS_TO_CHECK;
  const scope = options.linkCheck?.scope ?? "all";
  let pageOrigin = "";
  try {
    pageOrigin = new URL(finalUrl).origin;
  } catch {
    return { checks: [], meta: { eligibleLinkCount: 0, sampledLinkCount: 0, maxLinksToCheck, scope } };
  }

  const uniqueUrls = new Set<string>();
  const allEligible = new Set<string>();

  for (const el of elements) {
    if (el.tagName !== "a") continue;
    const href = el.attributes.href;
    if (!href) continue;
    if (SKIPPABLE_HREF_PREFIXES.some((prefix) => href.trim().toLowerCase().startsWith(prefix))) continue;

    let resolved: URL;
    try {
      resolved = new URL(href, finalUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (!linkMatchesScope(resolved, pageOrigin, scope)) continue;

    allEligible.add(resolved.toString());
    if (uniqueUrls.size < maxLinksToCheck) {
      uniqueUrls.add(resolved.toString());
    }
  }

  const eligibleLinkCount = allEligible.size;

  const results = await Promise.all(
    Array.from(uniqueUrls).map(async (url): Promise<LinkCheck | null> => {
      try {
        await networkPolicy.assertAllowed(url);
      } catch {
        return null;
      }
      const result = await adapter.fetchExternal(url, LINK_CHECK_TIMEOUT_MS);
      return { url, ok: result.ok, status: result.status, error: result.error };
    })
  );

  const checks = results.filter((r): r is LinkCheck => r !== null);
  return {
    checks,
    meta: {
      eligibleLinkCount,
      sampledLinkCount: checks.length,
      maxLinksToCheck,
      scope,
    },
  };
}

// Unlike the SEO/link checks (a handful of network fetches), each focus
// check is a real interaction — focus, two style reads, blur — so this
// is gated to the desktop viewport at the SOURCE, not just at the
// detector level: there's no value in cycling focus through the same
// elements three times over when the result won't vary by viewport, and
// the added time cost per element is real enough to be worth skipping
// entirely on tablet/mobile passes rather than just deduplicating after
// the fact.
const MAX_FOCUS_CHECKS = 20;

/**
 * Samples up to MAX_FOCUS_CHECKS visible interactive elements (in DOM
 * order — first N, not a "most important" ranking, since that would
 * need its own judgment call) and actually focuses each one to see
 * whether a real visible change occurs, via `checkFocusIndicators` on
 * the Browser Adapter. Never throws: the Adapter method itself already
 * omits elements it couldn't check cleanly rather than erroring out.
 */
async function collectFocusIndicatorChecks(
  adapter: BrowserAdapter,
  elements: ElementSnapshot[],
  viewport: Viewport
): Promise<FocusIndicatorCheck[]> {
  if (viewport.name !== "desktop") return [];

  const candidateSelectors = elements
    .filter((el) => el.isInteractive && el.isVisible)
    .slice(0, MAX_FOCUS_CHECKS)
    .map((el) => el.selector);

  if (candidateSelectors.length === 0) return [];

  return adapter.checkFocusIndicators(candidateSelectors);
}

const MAX_HOVER_CHECKS = 20;

/**
 * Same shape and reasoning as `collectFocusIndicatorChecks`, for hover
 * instead of focus. Scoped to elements a real user would actually
 * expect hover feedback from — links and buttons, not every element
 * `isInteractive` happens to be true for (e.g. a form input doesn't
 * conventionally get a hover style the way a clickable button does).
 */
async function collectHoverFeedbackChecks(
  adapter: BrowserAdapter,
  elements: ElementSnapshot[],
  viewport: Viewport
): Promise<HoverFeedbackCheck[]> {
  if (viewport.name !== "desktop") return [];

  const candidateSelectors = elements
    .filter((el) => el.isVisible && (el.tagName === "a" || el.tagName === "button"))
    .slice(0, MAX_HOVER_CHECKS)
    .map((el) => el.selector);

  if (candidateSelectors.length === 0) return [];

  return adapter.checkHoverFeedback(candidateSelectors);
}

const MAX_TOGGLE_CHECKS = 10;

/**
 * Samples elements carrying `aria-expanded` — the standard ARIA pattern
 * for dropdowns, accordions, and disclosure widgets — and clicks each
 * one to verify the toggle actually works, via `checkExpandableToggles`
 * on the Browser Adapter (which also restores the original state before
 * returning). Capped lower than focus/hover checks since a click-wait-
 * click-wait cycle is slower than a single focus or hover.
 */
async function collectExpandableToggleChecks(
  adapter: BrowserAdapter,
  elements: ElementSnapshot[],
  viewport: Viewport
): Promise<ExpandableToggleCheck[]> {
  if (viewport.name !== "desktop") return [];

  const candidateSelectors = elements
    .filter((el) => el.isVisible && el.attributes["aria-expanded"] !== undefined)
    .slice(0, MAX_TOGGLE_CHECKS)
    .map((el) => el.selector);

  if (candidateSelectors.length === 0) return [];

  return adapter.checkExpandableToggles(candidateSelectors);
}
