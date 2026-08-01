import {
  PageContext,
  Viewport,
  ElementSnapshot,
  ImageSnapshot,
  NetworkResource,
  ConsoleMessage,
  FontFaceSnapshot,
  SvgSnapshot,
} from "@ui-quality/shared";
import { BrowserAdapter } from "../browser/browser-adapter";
import { assertUrlIsSafe } from "../security/url-security-guard";

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
