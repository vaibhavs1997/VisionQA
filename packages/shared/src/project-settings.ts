import type { LinkCheckMeta, PageNavigationMeta, CrawlMode } from "./page-context.types";

export type LinkCheckScope = "all" | "internal" | "external";

export type { CrawlMode };

export interface ProjectScanSettings {
  /** Max unique `<a href>` targets to check per page (default 30). */
  maxLinksToCheck?: number;
  linkCheckScope?: LinkCheckScope;
  /** Run axe-core after DOM collection (desktop viewport). */
  runAxe?: boolean;
  /** Compare viewport screenshots to the previous completed scan on this project. */
  visualRegression?: boolean;
  /** Default crawl mode for new scans on this project. */
  defaultCrawlMode?: CrawlMode;
  /** Default max pages when crawl mode is not `single`. */
  defaultMaxPages?: number;
}

export const DEFAULT_MAX_LINKS_TO_CHECK = 30;
export const DEFAULT_MAX_CRAWL_PAGES = 25;
export const MAX_CRAWL_PAGES_HARD_CAP = 100;

export function parseProjectSettings(raw: Record<string, unknown> | null | undefined): Required<
  Pick<ProjectScanSettings, "maxLinksToCheck" | "linkCheckScope" | "runAxe" | "visualRegression" | "defaultCrawlMode" | "defaultMaxPages">
> {
  const s = raw ?? {};
  const maxLinks = typeof s.maxLinksToCheck === "number" ? s.maxLinksToCheck : DEFAULT_MAX_LINKS_TO_CHECK;
  const scope = s.linkCheckScope === "internal" || s.linkCheckScope === "external" ? s.linkCheckScope : "all";
  const crawlMode =
    s.defaultCrawlMode === "sitemap" || s.defaultCrawlMode === "bfs" ? s.defaultCrawlMode : "single";
  const maxPages =
    typeof s.defaultMaxPages === "number"
      ? Math.min(MAX_CRAWL_PAGES_HARD_CAP, Math.max(1, s.defaultMaxPages))
      : DEFAULT_MAX_CRAWL_PAGES;

  return {
    maxLinksToCheck: Math.min(100, Math.max(1, maxLinks)),
    linkCheckScope: scope,
    runAxe: s.runAxe === true,
    visualRegression: s.visualRegression === true,
    defaultCrawlMode: crawlMode,
    defaultMaxPages: maxPages,
  };
}

export interface ScanInsights {
  navigation?: PageNavigationMeta;
  linkCheck?: LinkCheckMeta;
  crawl?: { mode: CrawlMode; pagesPlanned: number; pagesCompleted: number; urls: string[] };
  detectorChecklist?: { id: string; category: string; ran: boolean }[];
}
