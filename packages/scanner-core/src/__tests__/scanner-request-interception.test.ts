import { describe, expect, it } from "vitest";
import {
  createScannerRequestInterception,
  createScannerWebSocketInterception,
  InterceptedBrowserRequest,
} from "../browser/scanner-request-interception";
import { ScannerNetworkPolicy } from "../security/scanner-network-policy";

const publicPolicy = new ScannerNetworkPolicy({
  dnsLookup: async () => [{ address: "8.8.8.8", family: 4 }],
});

function fakeRoute(url: string, resourceType: string, navigation = false) {
  const calls = { continued: 0, aborted: 0, abortCode: "" };
  const request: InterceptedBrowserRequest = {
    url: () => url,
    method: () => "GET",
    resourceType: () => resourceType,
    isNavigationRequest: () => navigation,
  };
  return {
    calls,
    route: {
      request: () => request,
      continue: async () => { calls.continued += 1; },
      abort: async (code?: string) => { calls.aborted += 1; calls.abortCode = code ?? ""; },
    },
  };
}

describe("scanner request interception", () => {
  it("aborts private images without throwing", async () => {
    const blocked: string[] = [];
    const handler = createScannerRequestInterception(publicPolicy, { onBlockedRequest: (request) => blocked.push(request.resourceType()) });
    const { route, calls } = fakeRoute("http://127.0.0.1/private.png", "image");

    await expect(handler(route)).resolves.toBeUndefined();
    expect(calls).toEqual({ continued: 0, aborted: 1, abortCode: "blockedbyclient" });
    expect(blocked).toEqual(["image"]);
  });

  it("aborts private fetch/XHR and iframe requests", async () => {
    const handler = createScannerRequestInterception(publicPolicy, { onBlockedRequest: () => {} });
    for (const [url, type] of [["http://169.254.169.254/latest/meta-data", "fetch"], ["http://10.1.2.3/frame", "document"]] as const) {
      const { route, calls } = fakeRoute(url, type, type === "document");
      await handler(route);
      expect(calls.aborted).toBe(1);
      expect(calls.continued).toBe(0);
    }
  });

  it("aborts a public-to-private redirect destination when it becomes a new navigation request", async () => {
    const blocked: string[] = [];
    const handler = createScannerRequestInterception(publicPolicy, { onBlockedRequest: (request) => blocked.push(request.url()) });
    const { route, calls } = fakeRoute("http://192.168.1.20/after-redirect", "document", true);

    await handler(route);
    expect(calls.aborted).toBe(1);
    expect(blocked).toEqual(["http://192.168.1.20/after-redirect"]);
  });

  it("continues legitimate public browser subresources", async () => {
    const handler = createScannerRequestInterception(publicPolicy, { onBlockedRequest: () => { throw new Error("public resource was blocked"); } });
    for (const type of ["script", "stylesheet", "image", "font", "xhr", "fetch", "media", "document", "other"]) {
      const { route, calls } = fakeRoute(`https://public.example/${type}`, type);
      await handler(route);
      expect(calls.continued).toBe(1);
      expect(calls.aborted).toBe(0);
    }
  });

  it("blocks a private WebSocket before it connects", async () => {
    const blocked: string[] = [];
    const handler = createScannerWebSocketInterception(publicPolicy, { onBlockedWebSocket: (url) => blocked.push(url) });
    let connected = 0;
    let closed = 0;
    await handler({
      url: () => "ws://127.0.0.1/internal",
      connectToServer: () => { connected += 1; },
      close: async () => { closed += 1; },
    });
    expect(connected).toBe(0);
    expect(closed).toBe(1);
    expect(blocked).toEqual(["ws://127.0.0.1/internal"]);
  });

  it("allows a legitimate public WebSocket connection", async () => {
    const handler = createScannerWebSocketInterception(publicPolicy, { onBlockedWebSocket: () => { throw new Error("public WebSocket was blocked"); } });
    let connected = 0;
    await handler({
      url: () => "wss://public.example/socket",
      connectToServer: () => { connected += 1; },
      close: async () => { throw new Error("should not close"); },
    });
    expect(connected).toBe(1);
  });
});
