import dns from "node:dns";
import { promisify } from "node:util";
import net from "node:net";

const dnsLookup = promisify(dns.lookup);

export class UrlSecurityError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "invalid-protocol"
      | "invalid-url"
      | "private-address"
      | "metadata-endpoint"
      | "too-many-redirects"
      | "dns-resolution-failed"
  ) {
    super(message);
    this.name = "UrlSecurityError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Cloud metadata endpoints — the single most common SSRF payoff target.
const METADATA_IPS = new Set([
  "169.254.169.254", // AWS/GCP/Azure/OpenStack link-local metadata
  "fd00:ec2::254", // AWS IMDS IPv6
]);

export interface UrlGuardOptions {
  maxRedirects?: number;
}

/**
 * Validates that an IPv4 address is not in a private/reserved/link-local
 * range. This is intentionally conservative — when in doubt, block.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local incl. metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast/reserved (224-255)
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower === "::") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local (fc00::/7)
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 address — unwrap and check as IPv4
    const mapped = lower.replace("::ffff:", "");
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);
  }
  return false;
}

function isBlockedAddress(ip: string): boolean {
  if (METADATA_IPS.has(ip)) return true;
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unrecognized format — fail closed
}

/**
 * Validates a URL is safe to navigate to: allowed protocol, hostname
 * resolves to a public (non-private, non-metadata) address. Must be
 * called again on every redirect hop, not just the initial URL — this
 * function only validates a single URL/hop; redirect-chain length is
 * tracked by the caller (see Browser Adapter, which revalidates on
 * each `response` with a redirect status).
 */
export async function assertUrlIsSafe(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UrlSecurityError(`"${rawUrl}" is not a valid URL.`, "invalid-url");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new UrlSecurityError(
      `Protocol "${parsed.protocol}" is not allowed. Only http/https are permitted.`,
      "invalid-protocol"
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UrlSecurityError("Localhost targets are not allowed in Phase 0.", "private-address");
  }

  // If the hostname is already a literal IP, check it directly.
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new UrlSecurityError(
        `Target address "${hostname}" resolves to a private, loopback, or metadata range.`,
        "private-address"
      );
    }
    return parsed;
  }

  // Otherwise resolve DNS and check every returned address (defends
  // against a hostname that resolves to multiple A/AAAA records where
  // only one is public — and is the first line of defense against
  // DNS rebinding, though full protection requires pinning the
  // resolved IP for the connection lifetime, done at the adapter layer).
  let addresses: dns.LookupAddress[];
  try {
    addresses = await promisify(dns.lookup)(hostname, { all: true });
  } catch (err) {
    throw new UrlSecurityError(
      `DNS resolution failed for "${hostname}".`,
      "dns-resolution-failed"
    );
  }

  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new UrlSecurityError(
        `"${hostname}" resolves to "${address}", which is a private, loopback, or metadata range.`,
        "private-address"
      );
    }
  }

  return parsed;
}

export function assertRedirectCountAllowed(count: number, options: UrlGuardOptions = {}): void {
  const max = options.maxRedirects ?? 10;
  if (count > max) {
    throw new UrlSecurityError(`Redirect chain exceeded ${max} hops.`, "too-many-redirects");
  }
}
