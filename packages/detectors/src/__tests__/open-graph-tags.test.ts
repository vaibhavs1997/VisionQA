import { describe, it, expect } from "vitest";
import { openGraphTagsDetector } from "../seo/open-graph-tags.detector";
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

describe("openGraphTagsDetector", () => {
  it("flags all three missing OG tags in one candidate", () => {
    const ctx = withSeo({ openGraph: {} });
    const issues = openGraphTagsDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain("og:title");
    expect(issues[0].title).toContain("og:description");
    expect(issues[0].title).toContain("og:image");
    expect(issues[0].severity).toBe("medium"); // og:image missing bumps severity
  });

  it("does NOT flag when all three are present", () => {
    const ctx = withSeo({ openGraph: { title: "T", description: "D", image: "https://example.test/og.png" } });
    expect(openGraphTagsDetector.run(ctx)).toHaveLength(0);
  });

  it("flags partial missing tags at lower severity when image is present", () => {
    const ctx = withSeo({ openGraph: { image: "https://example.test/og.png" } });
    const issues = openGraphTagsDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("low");
  });
});
