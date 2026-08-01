import { PageContext, ElementSnapshot, ImageSnapshot, NetworkResource, SvgSnapshot, FontFaceSnapshot } from "@ui-quality/shared";

const DEFAULT_COMPUTED_STYLE: ElementSnapshot["computedStyle"] = {
  display: "block",
  visibility: "visible",
  opacity: "1",
  position: "static",
  overflowX: "visible",
  overflowY: "visible",
  zIndex: "auto",
  color: "rgb(0,0,0)",
  backgroundColor: "rgba(0,0,0,0)",
  backgroundImage: "none",
  fontFamily: "sans-serif",
  fontSize: "16px",
  fontWeight: "400",
  lineHeight: "24px",
  textOverflow: "clip",
  whiteSpace: "normal",
  webkitLineClamp: "none",
  transform: "none",
};

const DEFAULT_LAYOUT_METRICS: ElementSnapshot["layoutMetrics"] = {
  clientWidth: 100,
  clientHeight: 50,
  scrollWidth: 100,
  scrollHeight: 50,
  offsetWidth: 100,
  offsetHeight: 50,
};

export function makeElement(overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return {
    id: overrides.id ?? "el_0",
    selector: overrides.selector ?? "div.test",
    tagName: overrides.tagName ?? "div",
    attributes: overrides.attributes ?? {},
    boundingBox: overrides.boundingBox ?? { x: 0, y: 0, width: 100, height: 50 },
    viewportIntersection: overrides.viewportIntersection ?? 1,
    isVisible: overrides.isVisible ?? true,
    isInteractive: overrides.isInteractive ?? false,
    computedStyle: { ...DEFAULT_COMPUTED_STYLE, ...overrides.computedStyle },
    layoutMetrics: { ...DEFAULT_LAYOUT_METRICS, ...overrides.layoutMetrics },
    ...overrides,
  };
}

export function makeImage(overrides: Partial<ImageSnapshot> = {}): ImageSnapshot {
  return {
    elementId: overrides.elementId ?? "img_0",
    selector: overrides.selector ?? "img.test",
    isVisible: overrides.isVisible ?? true,
    boundingBox: overrides.boundingBox ?? { x: 0, y: 0, width: 300, height: 200 },
    complete: overrides.complete ?? true,
    naturalWidth: overrides.naturalWidth ?? 300,
    naturalHeight: overrides.naturalHeight ?? 200,
    ...overrides,
  };
}

export function makePageContext(overrides: Partial<PageContext> = {}): PageContext {
  return {
    scan: {
      scanId: "scan_test",
      requestedUrl: "https://example.test/",
      startedAt: new Date().toISOString(),
      browser: "chromium",
      viewport: { name: "desktop", width: 1440, height: 900 },
      userAgent: "test-agent",
    },
    page: {
      finalUrl: "https://example.test/",
      title: "Test Page",
      statusCode: 200,
      loadState: "loaded",
      documentWidth: 1440,
      documentHeight: 900,
      viewportWidth: 1440,
      viewportHeight: 900,
      scrollWidth: 1440,
      scrollHeight: 900,
      hasHorizontalScroll: false,
    },
    elements: [],
    images: [],
    resources: [],
    consoleMessages: [],
    screenshots: [],
    fonts: [],
    svgs: [],
    ...overrides,
  };
}

export function makeResource(overrides: Partial<NetworkResource> = {}): NetworkResource {
  return {
    url: overrides.url ?? "https://example.test/style.css",
    method: overrides.method ?? "GET",
    resourceType: overrides.resourceType ?? "stylesheet",
    ok: overrides.ok ?? false,
    ...overrides,
  };
}

export function makeFormElement(overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return makeElement({
    tagName: "input",
    selector: "input.test",
    formFieldInfo: {
      inputType: "text",
      hasLabelElement: false,
      hasAriaLabel: false,
      hasAriaLabelledBy: false,
      hasPlaceholder: false,
      isHidden: false,
    },
    ...overrides,
  });
}

export function makeSvg(overrides: Partial<SvgSnapshot> = {}): SvgSnapshot {
  return {
    elementId: overrides.elementId ?? "svg_0",
    selector: overrides.selector ?? "svg.test",
    isVisible: overrides.isVisible ?? true,
    boundingBox: overrides.boundingBox ?? { x: 0, y: 0, width: 24, height: 24 },
    hasVisibleShape: overrides.hasVisibleShape ?? true,
    isLikelyIconFont: overrides.isLikelyIconFont ?? false,
    ...overrides,
  };
}

export function makeFont(overrides: Partial<FontFaceSnapshot> = {}): FontFaceSnapshot {
  return {
    family: overrides.family ?? "Custom Sans",
    status: overrides.status ?? "loaded",
    ...overrides,
  };
}
