import { describe, it, expect } from "vitest";
import { metaTagsDetector } from "../seo/meta-tags.detector";
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
    page: {
      ...BASE_PAGE,
      seo: {
        openGraph: {},
        robotsTxt: { checked: false, accessible: false, sitemapUrls: [], disallowRules: [] },
        ...seo,
      },
    },
  });
}

describe("metaTagsDetector", () => {
  it("flags a missing meta description", () => {
    const ctx = withSeo({});
    const issues = metaTagsDetector.run(ctx) as any[];
    expect(issues.some((i) => i.issueType === "missing-meta-description")).toBe(true);
  });

  it("does NOT flag a well-formed meta description", () => {
    const ctx = withSeo({ metaDescription: "A".repeat(100), canonicalUrl: "https://example.test/" });
    const issues = metaTagsDetector.run(ctx) as any[];
    expect(issues.some((i) => i.issueType === "missing-meta-description")).toBe(false);
    expect(issues.some((i) => i.issueType === "meta-description-length")).toBe(false);
  });

  it("flags a too-short meta description", () => {
    const ctx = withSeo({ metaDescription: "Too short.", canonicalUrl: "https://example.test/" });
    const issues = metaTagsDetector.run(ctx) as any[];
    expect(issues.some((i) => i.issueType === "meta-description-length")).toBe(true);
  });

  it("flags noindex robots meta at critical severity", () => {
    const ctx = withSeo({ metaDescription: "A".repeat(100), metaRobots: "noindex, nofollow", canonicalUrl: "https://example.test/" });
    const issues = metaTagsDetector.run(ctx) as any[];
    const issue = issues.find((i) => i.issueType === "noindex-robots-meta");
    expect(issue).toBeDefined();
    expect(issue.severity).toBe("critical");
  });

  it("flags a missing canonical tag", () => {
    const ctx = withSeo({ metaDescription: "A".repeat(100) });
    const issues = metaTagsDetector.run(ctx) as any[];
    expect(issues.some((i) => i.issueType === "missing-canonical-tag")).toBe(true);
  });

  it("does NOT run on non-desktop viewports (avoids 3x duplication across viewports)", () => {
    const ctx = makePageContext({
      scan: {
        scanId: "s",
        requestedUrl: "https://example.test/",
        startedAt: new Date().toISOString(),
        browser: "chromium",
        viewport: { name: "mobile", width: 390, height: 844 },
        userAgent: "test",
      },
      page: { ...BASE_PAGE, seo: { openGraph: {}, robotsTxt: { checked: false, accessible: false, sitemapUrls: [], disallowRules: [] } } },
    });
    expect(metaTagsDetector.run(ctx)).toHaveLength(0);
  });

  it("reports nothing when seo snapshot is entirely absent (e.g. benchmark fixtures)", () => {
    const ctx = makePageContext();
    expect(metaTagsDetector.run(ctx)).toHaveLength(0);
  });
});
