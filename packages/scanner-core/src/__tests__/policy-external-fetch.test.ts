import { describe, expect, it } from "vitest";
import { fetchExternalWithPolicy, PolicyExternalRequestClient } from "../browser/policy-external-fetch";
import { ScannerNetworkPolicy } from "../security/scanner-network-policy";

const publicPolicy = new ScannerNetworkPolicy({ dnsLookup: async () => [{ address: "8.8.8.8", family: 4 }] });

function clientFor(responses: Array<{ status: number; location?: string; body?: string }>, requested: string[]): PolicyExternalRequestClient {
  return {
    get: async (destination) => {
      requested.push(destination.url.toString());
      const response = responses.shift()!;
      return {
        status: () => response.status,
        headers: () => ({ location: response.location }),
        body: async () => Buffer.from(response.body ?? ""),
      };
    },
  };
}

describe("policy external HTTP client", () => {
  it("blocks a robots.txt redirect to a private destination before requesting it", async () => {
    const requested: string[] = [];
    const result = await fetchExternalWithPolicy(
      publicPolicy,
      "https://public.example/robots.txt",
      5000,
      clientFor([{ status: 302, location: "http://127.0.0.1/private-robots.txt" }], requested)
    );
    expect(result.ok).toBe(false);
    expect(requested).toEqual(["https://public.example/robots.txt"]);
  });

  it("blocks a sitemap redirect to a private destination before requesting it", async () => {
    const requested: string[] = [];
    const result = await fetchExternalWithPolicy(
      publicPolicy,
      "https://public.example/sitemap.xml",
      5000,
      clientFor([{ status: 301, location: "http://10.0.0.1/private-sitemap.xml" }], requested)
    );
    expect(result.ok).toBe(false);
    expect(requested).toEqual(["https://public.example/sitemap.xml"]);
  });

  it("permits a legitimate public HTTP client request", async () => {
    const requested: string[] = [];
    const result = await fetchExternalWithPolicy(
      publicPolicy, "https://public.example/robots.txt", 5000, clientFor([{ status: 200, body: "ok" }], requested)
    );
    expect(result).toMatchObject({ ok: true, status: 200, body: "ok" });
    expect(requested).toEqual(["https://public.example/robots.txt"]);
  });

  it("pins a public IPv4 resolution and does not re-resolve before connecting", async () => {
    let lookups = 0;
    const policy = new ScannerNetworkPolicy({
      dnsLookup: async () => {
        lookups += 1;
        return lookups === 1
          ? [{ address: "8.8.8.8", family: 4 }]
          : [{ address: "127.0.0.1", family: 4 }];
      },
    });
    let connectedAddress = "";
    const client: PolicyExternalRequestClient = {
      get: async (destination) => {
        connectedAddress = destination.addresses[0].address;
        return { status: () => 200, headers: () => ({}), body: async () => Buffer.from("ok") };
      },
    };
    await expect(fetchExternalWithPolicy(policy, "https://rebind.example/", 5000, client)).resolves.toMatchObject({ ok: true });
    expect(lookups).toBe(1);
    expect(connectedAddress).toBe("8.8.8.8");
  });

  it("pins a public IPv6 resolution and does not use a later private answer", async () => {
    let lookups = 0;
    const policy = new ScannerNetworkPolicy({
      dnsLookup: async () => {
        lookups += 1;
        return lookups === 1
          ? [{ address: "2606:4700:4700::1111", family: 6 }]
          : [{ address: "fd00:ec2::254", family: 6 }];
      },
    });
    let connectedAddress = "";
    const client: PolicyExternalRequestClient = {
      get: async (destination) => {
        connectedAddress = destination.addresses[0].address;
        return { status: () => 200, headers: () => ({}), body: async () => Buffer.from("ok") };
      },
    };
    await expect(fetchExternalWithPolicy(policy, "https://rebind-v6.example/", 5000, client)).resolves.toMatchObject({ ok: true });
    expect(lookups).toBe(1);
    expect(connectedAddress).toBe("2606:4700:4700::1111");
  });
});
