import { CrawlMode, DEFAULT_MAX_CRAWL_PAGES, MAX_CRAWL_PAGES_HARD_CAP } from "@ui-quality/shared";

export interface DiscoverUrlsOptions {
  mode: CrawlMode;
  entryUrl: string;
  maxPages: number;
  /** Fetch robots/sitemap HTML (already security-checked by caller). */
  fetchText: (url: string, timeoutMs?: number) => Promise<{ ok: boolean; body?: string; status?: number }>;
}

function normalizeUrl(url: string, base: string): string | null {
  try {
    const u = new URL(url, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function parseSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    locs.push(match[1].trim());
  }
  return locs;
}

function parseAnchorHrefs(html: string, baseUrl: string): string[] {
  const hrefs: string[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const normalized = normalizeUrl(match[1], baseUrl);
    if (normalized) hrefs.push(normalized);
  }
  return hrefs;
}

/**
 * Returns an ordered, deduplicated URL list for multi-page scans.
 * `single` mode returns only the entry URL.
 */
export async function discoverUrls(options: DiscoverUrlsOptions): Promise<string[]> {
  const maxPages = Math.min(MAX_CRAWL_PAGES_HARD_CAP, Math.max(1, options.maxPages || DEFAULT_MAX_CRAWL_PAGES));
  const entry = normalizeUrl(options.entryUrl, options.entryUrl);
  if (!entry) return [];
  if (options.mode === "single") return [entry];

  const seen = new Set<string>();
  const queue: string[] = [entry];
  const out: string[] = [];

  if (options.mode === "sitemap") {
    const origin = new URL(entry).origin;
    const robots = await options.fetchText(`${origin}/robots.txt`);
    let sitemapUrls: string[] = [];
    if (robots.ok && robots.body) {
      for (const line of robots.body.split("\n")) {
        const m = line.match(/^\s*sitemap:\s*(.+)\s*$/i);
        if (m) sitemapUrls.push(m[1].trim());
      }
    }
    if (sitemapUrls.length === 0) {
      sitemapUrls = [`${origin}/sitemap.xml`];
    }
    for (const sm of sitemapUrls) {
      const res = await options.fetchText(sm);
      if (!res.ok || !res.body) continue;
      for (const loc of parseSitemapLocs(res.body)) {
        const n = normalizeUrl(loc, sm);
        if (!n || !sameOrigin(n, entry)) continue;
        if (!seen.has(n)) {
          seen.add(n);
          out.push(n);
          if (out.length >= maxPages) return out;
        }
      }
    }
    return out.length > 0 ? out : [entry];
  }

  // bounded BFS from entry URL
  while (queue.length > 0 && out.length < maxPages) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);

    const page = await options.fetchText(current);
    if (!page.ok || !page.body) continue;

    for (const href of parseAnchorHrefs(page.body, current)) {
      if (!sameOrigin(href, entry)) continue;
      if (!seen.has(href) && !queue.includes(href)) queue.push(href);
    }
  }

  return out;
}
