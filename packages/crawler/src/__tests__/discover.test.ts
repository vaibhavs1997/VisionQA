import { describe, expect, it } from "vitest";
import { discoverUrls } from "../index";
import { ScannerNetworkPolicy } from "@ui-quality/scanner-core";

const publicPolicy = new ScannerNetworkPolicy({
  dnsLookup: async () => [{ address: "8.8.8.8", family: 4 }],
});

describe("discoverUrls", () => {
  it("returns only entry URL for single mode", async () => {
    const urls = await discoverUrls({
      mode: "single",
      entryUrl: "https://example.com/",
      maxPages: 10,
      networkPolicy: publicPolicy,
      fetchText: async () => ({ ok: true, body: "" }),
    });
    expect(urls).toEqual(["https://example.com/"]);
  });

  it("does not fetch a private sitemap declared by robots.txt", async () => {
    const fetched: string[] = [];
    const urls = await discoverUrls({
      mode: "sitemap",
      entryUrl: "https://public.example/",
      maxPages: 10,
      networkPolicy: publicPolicy,
      fetchText: async (url) => {
        fetched.push(url);
        return { ok: true, body: "Sitemap: http://127.0.0.1/private.xml" };
      },
    });
    expect(urls).toEqual(["https://public.example/"]);
    expect(fetched).toEqual(["https://public.example/robots.txt"]);
  });

  it("does not navigate to a private URL discovered in sitemap data", async () => {
    const fetched: string[] = [];
    const urls = await discoverUrls({
      mode: "sitemap",
      entryUrl: "https://public.example/",
      maxPages: 10,
      networkPolicy: publicPolicy,
      fetchText: async (url) => {
        fetched.push(url);
        if (url.endsWith("robots.txt")) return { ok: true, body: "Sitemap: https://public.example/sitemap.xml" };
        return { ok: true, body: "<urlset><url><loc>http://127.0.0.1/private</loc></url><url><loc>https://public.example/ok</loc></url></urlset>" };
      },
    });
    expect(urls).toEqual(["https://public.example/ok"]);
    expect(fetched).toEqual(["https://public.example/robots.txt", "https://public.example/sitemap.xml"]);
  });

  it("does not fetch a private URL discovered during BFS crawling", async () => {
    const fetched: string[] = [];
    const urls = await discoverUrls({
      mode: "bfs",
      entryUrl: "https://public.example/",
      maxPages: 10,
      networkPolicy: publicPolicy,
      fetchText: async (url) => {
        fetched.push(url);
        return { ok: true, body: '<a href="http://127.0.0.1/private">private</a><a href="/public">public</a>' };
      },
    });
    expect(urls).toEqual(["https://public.example/", "https://public.example/public"]);
    expect(fetched).not.toContain("http://127.0.0.1/private");
  });

  it("follows public sitemap indexes and preserves public crawling", async () => {
    const urls = await discoverUrls({
      mode: "sitemap",
      entryUrl: "https://public.example/",
      maxPages: 10,
      networkPolicy: publicPolicy,
      fetchText: async (url) => {
        if (url.endsWith("robots.txt")) return { ok: true, body: "Sitemap: https://public.example/index.xml" };
        if (url.endsWith("index.xml")) return { ok: true, body: "<sitemapindex><sitemap><loc>https://public.example/pages.xml</loc></sitemap></sitemapindex>" };
        return { ok: true, body: "<urlset><url><loc>https://public.example/a</loc></url></urlset>" };
      },
    });
    expect(urls).toEqual(["https://public.example/a"]);
  });
});
