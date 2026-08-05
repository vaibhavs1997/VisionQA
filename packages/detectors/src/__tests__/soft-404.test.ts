import { describe, expect, it } from "vitest";
import { soft404Detector } from "../content/soft-404.detector";
import { makePageContext } from "./fixtures";

describe("soft-404-v1", () => {
  it("flags error-like title on HTTP 200", async () => {
    const ctx = makePageContext();
    ctx.scan.viewport.name = "desktop";
    ctx.page.title = "404 — Page not found";
    ctx.page.statusCode = 200;
    const out = await Promise.resolve(soft404Detector.run(ctx));
    expect(out.some((c) => c.issueType === "soft-404")).toBe(true);
  });
});
