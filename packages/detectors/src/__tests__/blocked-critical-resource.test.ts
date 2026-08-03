import { describe, it, expect } from "vitest";
import { blockedCriticalResourceDetector } from "../seo/blocked-critical-resource.detector";
import { makePageContext, makeResource } from "./fixtures";
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

function withSeoAndResources(seo: Partial<SeoSnapshot>, resources: ReturnType<typeof makeResource>[]) {
  return makePageContext({
    page: { ...BASE_PAGE, seo: { openGraph: {}, robotsTxt: { checked: true, accessible: true, sitemapUrls: [], disallowRules: [] }, ...seo } },
    resources,
  });
}

describe("blockedCriticalResourceDetector", () => {
  it("flags a stylesheet blocked by a robots.txt Disallow rule", () => {
    const ctx = withSeoAndResources(
      { robotsTxt: { checked: true, accessible: true, sitemapUrls: [], disallowRules: ["/assets/"] } },
      [makeResource({ url: "https://example.test/assets/main.css", resourceType: "stylesheet", ok: true })]
    );
    const issues = blockedCriticalResourceDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high");
  });

  it("does NOT flag resources outside the disallowed path", () => {
    const ctx = withSeoAndResources(
      { robotsTxt: { checked: true, accessible: true, sitemapUrls: [], disallowRules: ["/admin/"] } },
      [makeResource({ url: "https://example.test/assets/main.css", resourceType: "stylesheet", ok: true })]
    );
    expect(blockedCriticalResourceDetector.run(ctx)).toHaveLength(0);
  });

  it("ignores non-critical resource types (e.g. images) even if the path is disallowed", () => {
    const ctx = withSeoAndResources(
      { robotsTxt: { checked: true, accessible: true, sitemapUrls: [], disallowRules: ["/assets/"] } },
      [makeResource({ url: "https://example.test/assets/photo.jpg", resourceType: "image", ok: true })]
    );
    expect(blockedCriticalResourceDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT run when there are no disallow rules at all", () => {
    const ctx = withSeoAndResources({ robotsTxt: { checked: true, accessible: true, sitemapUrls: [], disallowRules: [] } }, [
      makeResource({ url: "https://example.test/assets/main.css", resourceType: "stylesheet", ok: true }),
    ]);
    expect(blockedCriticalResourceDetector.run(ctx)).toHaveLength(0);
  });
});
