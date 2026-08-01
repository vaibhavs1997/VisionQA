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
  documentWidth: number;
  documentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  hasHorizontalScroll: boolean;
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
  close(): Promise<void>;
}
