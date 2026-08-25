import dns from "node:dns";
import net from "node:net";

export const NETWORK_DESTINATION_BLOCKED = "NETWORK_DESTINATION_BLOCKED" as const;
export type NetworkBlockReason = "INVALID_URL" | "UNSUPPORTED_PROTOCOL" | "DNS_RESOLUTION_FAILED" | "UNSAFE_ADDRESS";

/** A deliberately sanitized error: never include an internal IP or DNS error in a client response. */
export class ScannerNetworkPolicyError extends Error {
  readonly code = NETWORK_DESTINATION_BLOCKED;
  constructor(public readonly reason: NetworkBlockReason) {
    super(NETWORK_DESTINATION_BLOCKED);
    this.name = "ScannerNetworkPolicyError";
  }
}

export type DnsLookup = (hostname: string) => Promise<dns.LookupAddress[]>;
export interface ScannerNetworkPolicyOptions {
  dnsLookup?: DnsLookup;
  /** Test/benchmark-only: permits loopback only, never other unsafe ranges. */
  allowLoopbackForTestFixtures?: boolean;
}

const metadataIps = new Set(["169.254.169.254", "fd00:ec2::254"]);

function parseIpv6Words(address: string): number[] | null {
  const input = address.toLowerCase();
  const ipv4Separator = input.lastIndexOf(":");
  let normalized = input;
  if (input.includes(".")) {
    const tail = input.slice(ipv4Separator + 1);
    if (!net.isIPv4(tail)) return null;
    const octets = tail.split(".").map(Number);
    normalized = `${input.slice(0, ipv4Separator)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (left.length + right.length > 8 || (halves.length === 1 && left.length !== 8)) return null;
  const parts = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

function isUnsafeIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function isUnsafeIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (metadataIps.has(lower)) return true;
  const words = parseIpv6Words(lower);
  if (!words) return true;
  const allZero = words.every((word) => word === 0);
  if (allZero || (words.slice(0, 7).every((word) => word === 0) && words[7] === 1)) return true;
  if ((words[0] & 0xff00) === 0xff00) return true;
  if ((words[0] & 0xffc0) === 0xfe80) return true;
  if ((words[0] & 0xfe00) === 0xfc00) return true;
  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const ipv4Compatible = words.slice(0, 6).every((word) => word === 0);
  if (ipv4Mapped || ipv4Compatible) {
    const mapped = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`;
    return isUnsafeIpv4(mapped);
  }
  return false;
}

export function isUnsafeScannerAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (metadataIps.has(normalized)) return true;
  if (net.isIPv4(normalized)) return isUnsafeIpv4(normalized);
  if (net.isIPv6(normalized)) return isUnsafeIpv6(normalized);
  return true;
}

/** Central policy for every scanner-owned HTTP(S) destination. */
export class ScannerNetworkPolicy {
  private readonly dnsLookup: DnsLookup;
  private readonly allowLoopbackForTestFixtures: boolean;
  constructor(options: ScannerNetworkPolicyOptions = {}) {
    this.dnsLookup = options.dnsLookup ?? ((hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true }));
    this.allowLoopbackForTestFixtures = options.allowLoopbackForTestFixtures === true;
  }
  /** Explicit narrow fixture policy; do not use from product scan paths. */
  static forTestFixtures(options: Omit<ScannerNetworkPolicyOptions, "allowLoopbackForTestFixtures"> = {}): ScannerNetworkPolicy {
    return new ScannerNetworkPolicy({ ...options, allowLoopbackForTestFixtures: true });
  }
  async assertAllowed(rawUrl: string): Promise<URL> {
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new ScannerNetworkPolicyError("INVALID_URL"); }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new ScannerNetworkPolicyError("UNSUPPORTED_PROTOCOL");
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      if (this.allowLoopbackForTestFixtures) return url;
      throw new ScannerNetworkPolicyError("UNSAFE_ADDRESS");
    }
    if (net.isIP(hostname)) {
      if (this.allowLoopbackForTestFixtures && (hostname.startsWith("127.") || hostname === "::1")) return url;
      if (isUnsafeScannerAddress(hostname)) throw new ScannerNetworkPolicyError("UNSAFE_ADDRESS");
      return url;
    }
    let addresses: dns.LookupAddress[];
    try { addresses = await this.dnsLookup(hostname); } catch { throw new ScannerNetworkPolicyError("DNS_RESOLUTION_FAILED"); }
    if (addresses.length === 0 || addresses.some(({ address }) => isUnsafeScannerAddress(address))) {
      throw new ScannerNetworkPolicyError("UNSAFE_ADDRESS");
    }
    return url;
  }
}
