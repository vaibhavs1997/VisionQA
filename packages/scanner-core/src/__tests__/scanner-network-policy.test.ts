import { describe, expect, it } from "vitest";
import {
  NETWORK_DESTINATION_BLOCKED,
  ScannerNetworkPolicy,
  ScannerNetworkPolicyError,
} from "../security/scanner-network-policy";

const policyFor = (addresses: string[]) => new ScannerNetworkPolicy({
  dnsLookup: async () => addresses.map((address) => ({ address, family: (address.includes(":") ? 6 : 4) as 4 | 6 })),
});

async function expectBlocked(policy: ScannerNetworkPolicy, url: string, reason?: string) {
  try {
    await policy.assertAllowed(url);
    expect.fail(`Expected ${url} to be blocked`);
  } catch (error) {
    expect(error).toBeInstanceOf(ScannerNetworkPolicyError);
    expect((error as ScannerNetworkPolicyError).code).toBe(NETWORK_DESTINATION_BLOCKED);
    if (reason) expect((error as ScannerNetworkPolicyError).reason).toBe(reason);
    expect((error as Error).message).toBe(NETWORK_DESTINATION_BLOCKED);
  }
}

describe("ScannerNetworkPolicy", () => {
  it("allows public literals and a hostname when every DNS answer is public", async () => {
    await expect(policyFor([]).assertAllowed("https://8.8.8.8/path")).resolves.toBeInstanceOf(URL);
    await expect(policyFor(["8.8.8.8", "2606:4700:4700::1111"]).assertAllowed("https://public.example/path")).resolves.toBeInstanceOf(URL);
  });

  it("allows only HTTP and HTTPS", async () => {
    const policy = policyFor(["8.8.8.8"]);
    await expectBlocked(policy, "file:///etc/passwd", "UNSUPPORTED_PROTOCOL");
    await expectBlocked(policy, "ftp://public.example/file", "UNSUPPORTED_PROTOCOL");
    await expectBlocked(policy, "not a URL", "INVALID_URL");
  });

  it("blocks localhost and all required IPv4 private, link-local, multicast, and unspecified ranges", async () => {
    const policy = policyFor([]);
    for (const host of ["localhost", "foo.localhost", "127.1.2.3", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "224.0.0.1"]) {
      await expectBlocked(policy, `http://${host}/`, "UNSAFE_ADDRESS");
    }
  });

  it("blocks IPv6 loopback, unspecified, unique-local, link-local, multicast, and metadata addresses", async () => {
    const policy = policyFor([]);
    for (const host of ["[::1]", "[::]", "[fc00::1]", "[fd12::1]", "[fe80::1]", "[ff02::1]", "[fd00:ec2::254]"]) {
      await expectBlocked(policy, `http://${host}/`, "UNSAFE_ADDRESS");
    }
  });

  it("blocks IPv4-mapped IPv6 private addresses in dotted and hexadecimal forms", async () => {
    const policy = policyFor([]);
    for (const host of ["[::ffff:127.0.0.1]", "[::ffff:10.0.0.1]", "[::ffff:c0a8:0001]"]) {
      await expectBlocked(policy, `http://${host}/`, "UNSAFE_ADDRESS");
    }
  });

  it("fails closed for DNS failures, empty answers, and mixed safe/unsafe answers", async () => {
    const failedDns = new ScannerNetworkPolicy({ dnsLookup: async () => { throw new Error("resolver unavailable"); } });
    await expectBlocked(failedDns, "https://public.example", "DNS_RESOLUTION_FAILED");
    await expectBlocked(policyFor([]), "https://public.example", "UNSAFE_ADDRESS");
    await expectBlocked(policyFor(["8.8.8.8", "10.0.0.1"]), "https://public.example", "UNSAFE_ADDRESS");
  });

  it("has a narrow explicit fixture policy that permits loopback only", async () => {
    const fixturePolicy = ScannerNetworkPolicy.forTestFixtures();
    await expect(fixturePolicy.assertAllowed("http://127.0.0.1:3000")).resolves.toBeInstanceOf(URL);
    await expectBlocked(fixturePolicy, "http://192.168.1.1", "UNSAFE_ADDRESS");
  });
});
