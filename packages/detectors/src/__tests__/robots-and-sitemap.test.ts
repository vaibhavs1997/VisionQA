import { describe, it, expect } from "vitest";
import { robotsAndSitemapDetector } from "../seo/robots-and-sitemap.detector";
import { makePageContext } from "./fixtures";
import { SeoSnapshot } from "@ui-quality/shared";

const BASE_PAGE = {
  finalUrl: "https://example.test/",
  title: "Test Page",
  statusCode: 200,
  loadState: "loaded" as const,
  documentWidth: 1440,
  documentHeight: 900,
  viewportWidth: 1440,
  viewportHeight: 900,
  scrollWidth: 1440,
  scrollHeight: 900,
  hasHorizontalScroll: false,
};

function withSeo(seo: Partial<SeoSnapshot>) {
  return makePageContext({
    page: { ...BASE_PAGE, seo: { openGraph: {}, robotsTxt: { checked: true, accessible: true, sitemapUrls: [], disallowRules: [] }, ...seo } },
  });
}

describe("robotsAndSitemapDetector", () => {
  it("flags an inaccessible robots.txt", () => {
    const ctx = withSeo({ robotsTxt: { checked: true, accessible: false, statusCode: 404, sitemapUrls: [], disallowRules: [] } });
    const issues = robotsAndSitemapDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("robots-txt-inaccessible");
  });

  it("flags a robots.txt with no declared sitemap", () => {
    const ctx = withSeo({ robotsTxt: { checked: true, accessible: true, statusCode: 200, sitemapUrls: [], disallowRules: [] } });
    const issues = robotsAndSitemapDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("sitemap-not-declared");
  });

  it("flags a declared but unreachable sitemap", () => {
    const ctx = withSeo({
      robotsTxt: { checked: true, accessible: true, statusCode: 200, sitemapUrls: ["https://example.test/sitemap.xml"], disallowRules: [] },
      sitemap: { url: "https://example.test/sitemap.xml", accessible: false, statusCode: 404 },
    });
    const issues = robotsAndSitemapDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("sitemap-inaccessible");
  });

  it("does NOT flag a healthy robots.txt + sitemap", () => {
    const ctx = withSeo({
      robotsTxt: { checked: true, accessible: true, statusCode: 200, sitemapUrls: ["https://example.test/sitemap.xml"], disallowRules: [] },
      sitemap: { url: "https://example.test/sitemap.xml", accessible: true, statusCode: 200 },
    });
    expect(robotsAndSitemapDetector.run(ctx)).toHaveLength(0);
  });

  it("reports nothing when the check never ran (checked: false) rather than assuming missing", () => {
    const ctx = withSeo({ robotsTxt: { checked: false, accessible: false, sitemapUrls: [], disallowRules: [] } });
    expect(robotsAndSitemapDetector.run(ctx)).toHaveLength(0);
  });
});
