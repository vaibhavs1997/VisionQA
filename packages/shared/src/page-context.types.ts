import { Viewport } from "./viewport-presets";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComputedStyleSnapshot {
  display: string;
  visibility: string;
  opacity: string;
  position: string;
  overflowX: string;
  overflowY: string;
  zIndex: string;
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  textOverflow: string;
  whiteSpace: string;
  webkitLineClamp: string;
  transform: string;
}

export interface FormFieldInfo {
  inputType?: string;
  hasLabelElement: boolean;
  hasAriaLabel: boolean;
  hasAriaLabelledBy: boolean;
  hasPlaceholder: boolean;
  isHidden: boolean;
}

export interface LayoutMetrics {
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  offsetWidth: number;
  offsetHeight: number;
}

export interface ElementSnapshot {
  id: string;
  selector: string;
  tagName: string;
  role?: string;
  text?: string;
  visibleText?: string;
  attributes: Record<string, string>;
  boundingBox: BoundingBox | null;
  viewportIntersection: number;
  isVisible: boolean;
  isInteractive: boolean;
  ariaHidden?: boolean;
  /** Computed accessible name (text content, aria-label, aria-labelledby,
   * title, or child img alt) — populated only for interactive elements
   * (button/link/[role=button]) since it requires browser-side computation. */
  accessibleName?: string;
  /** Whether this element has non-trivial content: visible text, or a
   * child image/SVG/icon-font glyph with non-zero rendered size. Used by
   * empty-component and element-outside-viewport detectors. */
  hasMeaningfulChildContent?: boolean;
  /** Populated only for input/select/textarea elements. */
  formFieldInfo?: FormFieldInfo;
  /** First non-transparent background color found by walking up the
   * ancestor chain — used by the low-contrast-candidate detector since an
   * element's own backgroundColor is very often transparent. */
  effectiveBackgroundColor?: string;
  /** True if a gradient/image background was found on this element or an
   * ancestor before a solid color was resolved — the contrast detector
   * must skip these rather than guess against an unrelated fallback color. */
  hasUnresolvedBackground?: boolean;
  /** True if an ancestor is a horizontally-scrollable container (carousel,
   * horizontal scroller) whose scrollWidth exceeds its clientWidth — such
   * elements legitimately sit outside the visible viewport until scrolled
   * and must not be treated as an off-screen layout defect. */
  isInsideHorizontalScrollContainer?: boolean;
  computedStyle: ComputedStyleSnapshot;
  layoutMetrics: LayoutMetrics;
}

export interface ImageSnapshot {
  elementId: string;
  selector: string;
  src?: string;
  currentSrc?: string;
  alt?: string;
  role?: string;
  ariaHidden?: boolean;
  isVisible: boolean;
  boundingBox: BoundingBox | null;
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  resourceStatus?: number;
  resourceFailure?: string;
}

export interface NetworkResource {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  ok: boolean;
  failureText?: string;
  fromServiceWorker?: boolean;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  location?: string;
}

export interface ScreenshotAsset {
  viewport: string;
  kind: "full-page" | "viewport";
  path: string;
}

export interface FontFaceSnapshot {
  family: string;
  status: "loading" | "loaded" | "error" | "unloaded";
  source?: string;
}

export interface SvgSnapshot {
  elementId: string;
  selector: string;
  isVisible: boolean;
  boundingBox: BoundingBox | null;
  hasVisibleShape: boolean;
  role?: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
  isLikelyIconFont: boolean;
}

export interface OpenGraphTags {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

export interface RobotsTxtCheck {
  checked: boolean;
  accessible: boolean;
  statusCode?: number;
  sitemapUrls: string[];
  /** Disallow rules parsed for the wildcard (User-agent: *) group only —
   * good enough to flag obviously-blocked CSS/JS without implementing a
   * full robots.txt rule-precedence engine. */
  disallowRules: string[];
}

export interface SitemapCheck {
  url: string;
  accessible: boolean;
  statusCode?: number;
}

export interface SeoSnapshot {
  metaDescription?: string;
  metaRobots?: string;
  canonicalUrl?: string;
  openGraph: OpenGraphTags;
  robotsTxt: RobotsTxtCheck;
  sitemap?: SitemapCheck;
}

export interface LinkCheck {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface PageContext {
  scan: {
    scanId: string;
    requestedUrl: string;
    startedAt: string;
    browser: "chromium";
    viewport: Viewport;
    userAgent: string;
  };
  page: {
    finalUrl: string;
    title: string;
    statusCode?: number;
    loadState: "loaded" | "timeout" | "failed";
    documentWidth: number;
    documentHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    hasHorizontalScroll: boolean;
    /** Optional because the internal benchmark harness (localhost
     * fixtures) and any environment where the robots.txt/sitemap fetch
     * itself failed outright won't have this populated. */
    seo?: SeoSnapshot;
    /**
     * Reachability results for a capped sample of unique `<a href>`
     * targets on the page (see `collectLinkChecks` for the cap and
     * timeout). Absent entirely if link checking wasn't run; a link
     * whose target isn't in this array simply wasn't sampled, which is
     * NOT the same as it being confirmed working.
     */
    linkChecks?: LinkCheck[];
  };
  elements: ElementSnapshot[];
  images: ImageSnapshot[];
  resources: NetworkResource[];
  consoleMessages: ConsoleMessage[];
  screenshots: ScreenshotAsset[];
  fonts: FontFaceSnapshot[];
  svgs: SvgSnapshot[];
}
