import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { ExternalFetchResult } from "./browser-adapter";
import { ResolvedScannerDestination, ScannerNetworkPolicy } from "../security/scanner-network-policy";

export interface PolicyExternalResponse {
  status(): number;
  headers(): Record<string, string | undefined>;
  body(): Promise<Buffer>;
}

export interface PolicyExternalRequestClient {
  get(destination: ResolvedScannerDestination, options: { timeout: number; maxRedirects: 0; failOnStatusCode: false }): Promise<PolicyExternalResponse>;
}

export interface PinnedHttpRequest {
  method: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
}

function pinnedLookup(destination: ResolvedScannerDestination): dns.LookupOneOptions {
  return ((hostname: string, _options: dns.LookupOneOptions, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
    if (hostname.replace(/^\[|\]$/g, "").toLowerCase() !== destination.hostname) {
      callback(Object.assign(new Error("unexpected DNS lookup hostname"), { code: "EAI_AGAIN" }), "", 0);
      return;
    }
    const address = destination.addresses[0];
    callback(null, address.address, address.family);
  }) as unknown as dns.LookupOneOptions;
}

async function nodeRequest(destination: ResolvedScannerDestination, request: PinnedHttpRequest): Promise<PolicyExternalResponse> {
  const transport = destination.url.protocol === "https:" ? https : http;
  const body = request.body === undefined ? undefined : Buffer.from(request.body);
  return new Promise((resolve, reject) => {
    const req = transport.request({
      protocol: destination.url.protocol,
      hostname: destination.hostname,
      port: destination.url.port || undefined,
      path: `${destination.url.pathname}${destination.url.search}`,
      method: request.method,
      headers: { Host: destination.url.host, ...request.headers },
      servername: destination.hostname,
      lookup: pinnedLookup(destination) as never,
      timeout: request.timeoutMs ?? 5000,
    }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        if (total < 200_001) {
          const bounded = chunk.subarray(0, 200_001 - total);
          chunks.push(bounded);
          total += bounded.length;
        }
      });
      response.on("end", () => resolve({
        status: () => response.statusCode ?? 0,
        headers: () => Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])),
        body: async () => Buffer.concat(chunks),
      }));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (body) req.write(body);
    req.end();
  });
}

/** Makes one HTTP request using only the already approved address. */
export async function requestWithPolicy(policy: ScannerNetworkPolicy, url: string, request: PinnedHttpRequest): Promise<PolicyExternalResponse> {
  return nodeRequest(await policy.resolveHttpDestination(url), request);
}

/** Redirecting text client with per-hop resolution and pinned Node connections. */
export async function fetchExternalWithPolicy(
  policy: ScannerNetworkPolicy,
  url: string,
  timeoutMs = 5000,
  client?: PolicyExternalRequestClient
): Promise<ExternalFetchResult> {
  try {
    let currentUrl = url;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      const destination = await policy.resolveHttpDestination(currentUrl);
      const response = client
        ? await client.get(destination, { timeout: timeoutMs, maxRedirects: 0, failOnStatusCode: false })
        : await nodeRequest(destination, { method: "GET", timeoutMs });
      const status = response.status();
      const location = response.headers()["location"];
      if (status >= 300 && status < 400 && location) {
        if (redirectCount === 5) return { ok: false, status, error: "redirect limit exceeded" };
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      const buffer = await response.body();
      return { ok: status >= 200 && status < 400, status, body: buffer.slice(0, 200_000).toString("utf-8") };
    }
    return { ok: false, error: "redirect limit exceeded" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}
