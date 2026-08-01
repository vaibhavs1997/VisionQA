import { describe, it, expect } from "vitest";
import { failedResourceDetector } from "../network/failed-resource.detector";
import { makePageContext, makeResource } from "./fixtures";

describe("failedResourceDetector", () => {
  it("flags a failed stylesheet as high severity", () => {
    const ctx = makePageContext({
      resources: [makeResource({ url: "https://example.test/app.css", resourceType: "stylesheet", status: 404, ok: false })],
    });
    const issues = failedResourceDetector.run(ctx) as any[];
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("high");
  });

  it("does NOT flag a successful (ok) resource", () => {
    const ctx = makePageContext({
      resources: [makeResource({ url: "https://example.test/app.css", ok: true, status: 200 })],
    });
    expect(failedResourceDetector.run(ctx)).toHaveLength(0);
  });

  it("ignores document-type resources (handled via page.loadState instead)", () => {
    const ctx = makePageContext({
      resources: [makeResource({ url: "https://example.test/", resourceType: "document", status: 500, ok: false })],
    });
    expect(failedResourceDetector.run(ctx)).toHaveLength(0);
  });

  it("lowers confidence and severity for known analytics domains", () => {
    const ctx = makePageContext({
      resources: [makeResource({ url: "https://www.google-analytics.com/collect", resourceType: "xhr", status: 400, ok: false })],
    });
    const issues = failedResourceDetector.run(ctx) as any[];
    expect(issues[0].confidence).toBe(0.7);
    expect(issues[0].severity).toBe("low");
  });

  it("deduplicates repeated failures of the same URL into one candidate", () => {
    const ctx = makePageContext({
      resources: [
        makeResource({ url: "https://example.test/app.js", resourceType: "script", status: 404, ok: false }),
        makeResource({ url: "https://example.test/app.js", resourceType: "script", status: 404, ok: false }),
      ],
    });
    expect(failedResourceDetector.run(ctx)).toHaveLength(1);
  });
});
