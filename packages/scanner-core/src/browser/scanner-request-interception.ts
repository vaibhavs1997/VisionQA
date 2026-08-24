import { ScannerNetworkPolicy, ScannerNetworkPolicyError } from "../security/scanner-network-policy";

export interface InterceptedBrowserRequest {
  url(): string;
  method(): string;
  resourceType(): string;
  isNavigationRequest(): boolean;
  frame?(): unknown;
}

export interface InterceptedBrowserRoute {
  request(): InterceptedBrowserRequest;
  continue(): Promise<void>;
  abort(errorCode?: "blockedbyclient"): Promise<void>;
}

export interface ScannerRequestInterceptionHooks {
  onBlockedRequest(request: InterceptedBrowserRequest, error: ScannerNetworkPolicyError): void;
}

function protocolOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).protocol;
  } catch {
    return null;
  }
}

/**
 * Returns the route callback installed on every scanner BrowserContext.
 * All HTTP(S) browser traffic reaches this handler: document navigations,
 * redirects, scripts, styles, images, XHR/fetch, frames, fonts, media, and
 * other subresources. Non-network schemes such as data: and blob: continue.
 */
export function createScannerRequestInterception(
  policy: ScannerNetworkPolicy,
  hooks: ScannerRequestInterceptionHooks
): (route: InterceptedBrowserRoute) => Promise<void> {
  return async (route) => {
    const request = route.request();
    const protocol = protocolOf(request.url());
    // These are browser-local payloads, not outbound destinations.
    if (protocol === "data:" || protocol === "blob:" || protocol === "about:") {
      await route.continue();
      return;
    }

    if (protocol !== "http:" && protocol !== "https:") {
      const blocked = new ScannerNetworkPolicyError("UNSUPPORTED_PROTOCOL");
      hooks.onBlockedRequest(request, blocked);
      await route.abort("blockedbyclient");
      return;
    }

    try {
      await policy.assertAllowed(request.url());
      await route.continue();
    } catch (error) {
      const blocked = error instanceof ScannerNetworkPolicyError
        ? error
        : new ScannerNetworkPolicyError("UNSAFE_ADDRESS");
      hooks.onBlockedRequest(request, blocked);
      // Aborting optional resources is intentional: it lets the document
      // finish while preventing access to internal infrastructure.
      await route.abort("blockedbyclient");
    }
  };
}
