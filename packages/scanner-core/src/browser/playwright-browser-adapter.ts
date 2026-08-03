import path from "node:path";
import fs from "node:fs";
import {
  chromium,
  Browser,
  BrowserContext,
  Page,
  Response as PWResponse,
} from "playwright";
import { Viewport, NetworkResource, ConsoleMessage, ScreenshotAsset } from "@ui-quality/shared";
import { BrowserAdapter, NavigateResult, RawElementData } from "./browser-adapter";
import { assertUrlIsSafe, assertRedirectCountAllowed } from "../security/url-security-guard";
import { collectPageDataInBrowser } from "../collector/browser-scripts";

export interface PlaywrightAdapterOptions {
  navigationTimeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
  /**
   * Optional override for the Chromium executable. Playwright normally
   * manages its own browser binary (`npx playwright install chromium`);
   * this override exists only for environments where that download path
   * is unavailable but a compatible Chromium binary is provided by
   * another mechanism. Defaults to Playwright's own managed browser.
   */
  executablePath?: string;
}

/**
 * The ONLY module in the codebase that imports Playwright. Detectors,
 * the issue engine, and the CLI never see a Playwright type — they only
 * ever talk to the BrowserAdapter interface. This is what keeps browser
 * automation a replaceable infrastructure dependency rather than the core
 * of the product (per the architecture's #2 principle).
 */
export class PlaywrightBrowserAdapter implements BrowserAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private redirectCount = 0;
  private resources: NetworkResource[] = [];
  private consoleMessages: ConsoleMessage[] = [];
  private readonly options: Required<PlaywrightAdapterOptions>;

  constructor(options: PlaywrightAdapterOptions = {}) {
    this.options = {
      navigationTimeoutMs: options.navigationTimeoutMs ?? 30_000,
      maxRedirects: options.maxRedirects ?? 10,
      maxResponseBytes: options.maxResponseBytes ?? 25 * 1024 * 1024, // 25MB
      executablePath: options.executablePath ?? process.env.UI_SCAN_CHROMIUM_PATH ?? "",
    };
  }

  async open(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      executablePath: this.options.executablePath || undefined,
      args: ["--disable-extensions", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    // Ephemeral, isolated context: no persisted cookies/profile, downloads
    // disabled, permissions denied by default. Every scan gets a fresh
    // context and nothing survives it — this is the Phase 0 minimum
    // security bar for opening untrusted URLs.
    this.context = await this.browser.newContext({
      acceptDownloads: false,
      permissions: [],
      javaScriptEnabled: true,
      bypassCSP: false,
      ignoreHTTPSErrors: false,
    });

    // Block downloads outright as a second layer of defense.
    this.context.on("page", (p) => {
      p.on("download", (download) => {
        download.cancel().catch(() => {});
      });
    });

    this.page = await this.context.newPage();

    this.page.on("console", (msg) => {
      this.consoleMessages.push({
        type: msg.type(),
        text: msg.text().slice(0, 1000),
        location: msg.location()?.url,
      });
    });

    this.page.on("response", async (response: PWResponse) => {
      try {
        const request = response.request();
        const status = response.status();

        if (status >= 300 && status < 400) {
          this.redirectCount += 1;
          assertRedirectCountAllowed(this.redirectCount, {
            maxRedirects: this.options.maxRedirects,
          });
          // Re-validate the redirect target against the URL guard —
          // this is what defends against a safe initial URL redirecting
          // to an internal/private target.
          const location = response.headers()["location"];
          if (location) {
            const resolved = new URL(location, response.url());
            await assertUrlIsSafe(resolved.toString());
          }
        }

        this.resources.push({
          url: response.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          status,
          ok: response.ok(),
          fromServiceWorker: (response as any).fromServiceWorker?.() ?? false,
        });
      } catch (err) {
        // Security guard rejection on a redirect surfaces here; store it
        // as a failed resource rather than throwing out of an event handler.
        this.resources.push({
          url: response.url(),
          method: response.request().method(),
          resourceType: response.request().resourceType(),
          ok: false,
          failureText: err instanceof Error ? err.message : "blocked by security guard",
        });
      }
    });

    this.page.on("requestfailed", (request) => {
      this.resources.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        ok: false,
        failureText: request.failure()?.errorText,
      });
    });
  }

  async navigate(url: string, viewport: Viewport, timeoutMs: number): Promise<NavigateResult> {
    if (!this.page) throw new Error("BrowserAdapter.open() must be called before navigate().");

    await this.page.setViewportSize({ width: viewport.width, height: viewport.height });

    let loadState: NavigateResult["loadState"] = "loaded";
    let statusCode: number | undefined;

    try {
      const response = await this.page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      statusCode = response?.status();

      // Best-effort settle: wait briefly for network idle, but don't fail
      // the whole scan if a page never goes fully idle (ads/analytics/etc).
      await this.page
        .waitForLoadState("networkidle", { timeout: Math.min(10_000, timeoutMs) })
        .catch(() => {
          /* acceptable: proceed with whatever loaded within the grace window */
        });

      // Settle window for animations/transitions before screenshots.
      await this.page.waitForTimeout(400);
    } catch (err) {
      loadState = "timeout";
    }

    return {
      finalUrl: this.page.url(),
      title: await this.page.title().catch(() => ""),
      statusCode,
      loadState,
      resources: this.resources,
      consoleMessages: this.consoleMessages,
    };
  }

  async collectPageData(): Promise<RawElementData> {
    if (!this.page) throw new Error("BrowserAdapter.open() must be called before collectPageData().");
    return (await this.page.evaluate(collectPageDataInBrowser)) as RawElementData;
  }

  async captureScreenshots(viewportName: string, outDir: string): Promise<ScreenshotAsset[]> {
    if (!this.page) throw new Error("BrowserAdapter.open() must be called before captureScreenshots().");
    fs.mkdirSync(outDir, { recursive: true });

    const assets: ScreenshotAsset[] = [];

    const viewportPath = path.join(outDir, `${viewportName}-viewport.png`);
    await this.page.screenshot({ path: viewportPath, fullPage: false });
    assets.push({ viewport: viewportName, kind: "viewport", path: viewportPath });

    const fullPagePath = path.join(outDir, `${viewportName}-full.png`);
    await this.page.screenshot({ path: fullPagePath, fullPage: true });
    assets.push({ viewport: viewportName, kind: "full-page", path: fullPagePath });

    return assets;
  }

  async getUserAgent(): Promise<string> {
    if (!this.page) return "";
    return this.page.evaluate(() => navigator.userAgent);
  }

  async fetchExternal(url: string, timeoutMs = 5000): Promise<import("./browser-adapter").ExternalFetchResult> {
    if (!this.context) return { ok: false, error: "adapter not open" };
    try {
      const response = await this.context.request.get(url, {
        timeout: timeoutMs,
        maxRedirects: 5,
        failOnStatusCode: false,
      });
      const status = response.status();
      // robots.txt/sitemap files are always small; cap defensively so a
      // misconfigured server returning something enormous at this path
      // can't blow up memory the way an uncapped page response could.
      const buffer = await response.body();
      const body = buffer.slice(0, 200_000).toString("utf-8");
      return { ok: status >= 200 && status < 400, status, body };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
    }
  }

  async checkFocusIndicators(
    selectors: string[]
  ): Promise<import("./browser-adapter").FocusCheckResult[]> {
    if (!this.page) return [];
    const results: import("./browser-adapter").FocusCheckResult[] = [];

    for (const selector of selectors) {
      try {
        const locator = this.page.locator(selector).first();
        if ((await locator.count()) === 0) continue;

        // Read the resting (unfocused) style first, then focus and read
        // again — some elements have a permanent border/shadow
        // regardless of focus state, so it's the *change* on focus that
        // indicates a real indicator, not just "some outline exists."
        const blurredStyle = await locator.evaluate((el) => {
          const s = getComputedStyle(el as Element);
          return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow, borderColor: s.borderColor };
        });

        await locator.focus({ timeout: 2000 });
        const focusedStyle = await locator.evaluate((el) => {
          const s = getComputedStyle(el as Element);
          return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow, borderColor: s.borderColor };
        });
        await locator.evaluate((el) => (el as HTMLElement).blur()).catch(() => {});

        const hasVisibleFocusIndicator =
          (focusedStyle.outlineStyle !== "none" && focusedStyle.outlineWidth !== "0px") ||
          (focusedStyle.boxShadow !== "none" && focusedStyle.boxShadow !== blurredStyle.boxShadow) ||
          focusedStyle.borderColor !== blurredStyle.borderColor;

        results.push({ selector, hasVisibleFocusIndicator });
      } catch {
        // Selector didn't resolve cleanly, or focus()/evaluate() threw
        // (e.g. the element became detached, or genuinely isn't
        // focusable despite looking interactive) — omit rather than
        // guess at a result for it, same convention as fetchExternal
        // failures for a single link.
      }
    }

    return results;
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => {});
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
