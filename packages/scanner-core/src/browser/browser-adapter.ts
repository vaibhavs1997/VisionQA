import { Viewport, NetworkResource, ConsoleMessage, ScreenshotAsset } from "@ui-quality/shared";

export interface NavigateResult {
  finalUrl: string;
  title: string;
  statusCode?: number;
  loadState: "loaded" | "timeout" | "failed";
  resources: NetworkResource[];
  consoleMessages: ConsoleMessage[];
}

export interface RawElementData {
  // Deliberately untyped/loose here — the Browser Adapter hands back
  // whatever the in-page collection script produces; PageContextCollector
  // (not the adapter) is responsible for shaping it into ElementSnapshot /
  // ImageSnapshot. This keeps the adapter ignorant of detector concerns.
  elements: unknown[];
  images: unknown[];
  svgs: unknown[];
  fonts: unknown[];
  seoMeta: unknown;
  documentWidth: number;
  documentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  hasHorizontalScroll: boolean;
}

export interface ExternalFetchResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

export interface FocusCheckResult {
  selector: string;
  hasVisibleFocusIndicator: boolean;
}

export interface HoverCheckResult {
  selector: string;
  hasVisibleHoverFeedback: boolean;
}

export interface ExpandableToggleResult {
  selector: string;
  toggledCorrectly: boolean;
  ariaControlsSelector?: string;
}

/**
 * The Browser Adapter is the ONLY module allowed to import a browser
 * automation library. Everything above this boundary — detectors, the
 * issue engine, the CLI — talks to this neutral interface only. Swapping
 * Playwright for Puppeteer/CDP later means writing a new class here,
 * nothing else in the codebase changes.
 */
export interface BrowserAdapter {
  open(): Promise<void>;
  navigate(url: string, viewport: Viewport, timeoutMs: number): Promise<NavigateResult>;
  collectPageData(): Promise<RawElementData>;
  captureScreenshots(viewportName: string, outDir: string): Promise<ScreenshotAsset[]>;
  getUserAgent(): Promise<string>;
  /**
   * Fetches a URL outside the page's own navigation — used for
   * robots.txt/sitemap reachability checks, which are about a different
   * resource entirely, not the page being scanned. Callers MUST run
   * `assertUrlIsSafe` on the target first; this method does not repeat
   * that check itself so it isn't hidden inside an adapter method that's
   * easy to forget matters. Must never throw — failures come back as
   * `{ ok: false, error }` so a single unreachable robots.txt can't take
   * down the scan the way an unhandled rejection would.
   */
  fetchExternal(url: string, timeoutMs?: number): Promise<ExternalFetchResult>;
  /**
   * Actually focuses each given element (in DOM/tab order — this is real
   * interaction, not a static snapshot) and diffs its computed style
   * against its own unfocused baseline to determine whether a focus
   * event produces any visible change (outline, box-shadow, or border
   * color). Selectors that don't resolve to exactly one element, or that
   * error out on focus, are simply omitted from the result rather than
   * guessed at.
   */
  checkFocusIndicators(selectors: string[]): Promise<FocusCheckResult[]>;
  /**
   * Same shape as `checkFocusIndicators` but for `:hover` — hovers each
   * element for real and diffs style against its own resting baseline.
   */
  checkHoverFeedback(selectors: string[]): Promise<HoverCheckResult[]>;
  /**
   * Clicks each given `aria-expanded` element for real and checks
   * whether the attribute actually flips and (when `aria-controls`
   * points at a real element) whether that element's visibility follows
   * the new state. Restores the original state with a second click
   * before returning, so this doesn't leave the page in a different
   * condition for whatever runs after it in the same collection pass.
   */
  checkExpandableToggles(selectors: string[]): Promise<ExpandableToggleResult[]>;
  close(): Promise<void>;
}
