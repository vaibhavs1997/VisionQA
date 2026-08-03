import { describe, it, expect } from "vitest";
import { brokenLinkDetector } from "../network/broken-link.detector";
import { makePageContext, makeElement } from "./fixtures";

describe("brokenLinkDetector", () => {
  it("flags a link whose linkCheck came back not-ok with a 404", () => {
    const ctx = makePageContext({
      elements: [makeElement({ tagName: "a", selector: "a.dead", attributes: { href: "/old-page" } })],
      page: {
        finalUrl: "https://example.test/",
        title: "",
        loadState: "loaded",
        documentWidth: 1280,
        documentHeight: 800,
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollWidth: 1280,
        scrollHeight: 800,
        hasHorizontalScroll: false,
        linkChecks: [{ url: "https://example.test/old-page", ok: false, status: 404 }],
      } as any,
    });
    const issues = brokenLinkDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].issueType).toBe("broken-link");
    expect(issues[0].evidence.measuredValue).toBe("HTTP 404");
  });

  it("does NOT flag a link that checked out ok", () => {
    const ctx = makePageContext({
      elements: [makeElement({ tagName: "a", selector: "a.ok", attributes: { href: "/fine" } })],
      page: {
        finalUrl: "https://example.test/",
        title: "",
        loadState: "loaded",
        documentWidth: 1280,
        documentHeight: 800,
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollWidth: 1280,
        scrollHeight: 800,
        hasHorizontalScroll: false,
        linkChecks: [{ url: "https://example.test/fine", ok: true, status: 200 }],
      } as any,
    });
    expect(brokenLinkDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag a link whose target wasn't sampled (absent from linkChecks)", () => {
    const ctx = makePageContext({
      elements: [makeElement({ tagName: "a", selector: "a.unsampled", attributes: { href: "/never-checked" } })],
      page: {
        finalUrl: "https://example.test/",
        title: "",
        loadState: "loaded",
        documentWidth: 1280,
        documentHeight: 800,
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollWidth: 1280,
        scrollHeight: 800,
        hasHorizontalScroll: false,
        linkChecks: [],
      } as any,
    });
    expect(brokenLinkDetector.run(ctx)).toHaveLength(0);
  });

  it("does NOT flag when linkChecks is entirely absent (link checking wasn't run)", () => {
    const ctx = makePageContext({
      elements: [makeElement({ tagName: "a", selector: "a.x", attributes: { href: "/x" } })],
    });
    expect(brokenLinkDetector.run(ctx)).toHaveLength(0);
  });

  it("deduplicates two links pointing at the same broken destination into one candidate", () => {
    const ctx = makePageContext({
      elements: [
        makeElement({ tagName: "a", selector: "header a.dead", attributes: { href: "/old-page" } }),
        makeElement({ tagName: "a", selector: "footer a.dead", attributes: { href: "/old-page" } }),
      ],
      page: {
        finalUrl: "https://example.test/",
        title: "",
        loadState: "loaded",
        documentWidth: 1280,
        documentHeight: 800,
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollWidth: 1280,
        scrollHeight: 800,
        hasHorizontalScroll: false,
        linkChecks: [{ url: "https://example.test/old-page", ok: false, status: 404 }],
      } as any,
    });
    expect(brokenLinkDetector.run(ctx)).toHaveLength(1);
  });

  it("does NOT flag anything on a non-desktop viewport (gated to avoid triple-reporting across viewports)", () => {
    const ctx = makePageContext({
      elements: [makeElement({ tagName: "a", selector: "a.dead", attributes: { href: "/old-page" } })],
      scan: {
        scanId: "scan_test",
        requestedUrl: "https://example.test/",
        startedAt: new Date().toISOString(),
        browser: "chromium",
        viewport: { name: "mobile", width: 390, height: 844 },
        userAgent: "test-agent",
      },
      page: {
        finalUrl: "https://example.test/",
        title: "",
        loadState: "loaded",
        documentWidth: 1280,
        documentHeight: 800,
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollWidth: 1280,
        scrollHeight: 800,
        hasHorizontalScroll: false,
        linkChecks: [{ url: "https://example.test/old-page", ok: false, status: 404 }],
      } as any,
    });
    expect(brokenLinkDetector.run(ctx)).toHaveLength(0);
  });
});
