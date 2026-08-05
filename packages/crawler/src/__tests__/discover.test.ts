import { describe, expect, it } from "vitest";
import { discoverUrls } from "../index";

describe("discoverUrls", () => {
  it("returns only entry URL for single mode", async () => {
    const urls = await discoverUrls({
      mode: "single",
      entryUrl: "https://example.com/",
      maxPages: 10,
      fetchText: async () => ({ ok: true, body: "" }),
    });
    expect(urls).toEqual(["https://example.com/"]);
  });
});
