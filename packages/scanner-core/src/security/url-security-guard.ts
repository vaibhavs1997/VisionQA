import { ScannerNetworkPolicy, ScannerNetworkPolicyError } from "./scanner-network-policy";

/** @deprecated Use ScannerNetworkPolicy directly. */
export class UrlSecurityError extends ScannerNetworkPolicyError {}

const defaultPolicy = new ScannerNetworkPolicy();

/** @deprecated Compatibility wrapper while callers migrate to ScannerNetworkPolicy. */
export async function assertUrlIsSafe(rawUrl: string): Promise<URL> {
  try {
    return await defaultPolicy.assertAllowed(rawUrl);
  } catch (error) {
    if (error instanceof ScannerNetworkPolicyError) throw new UrlSecurityError(error.reason);
    throw error;
  }
}

export interface UrlGuardOptions { maxRedirects?: number }
export function assertRedirectCountAllowed(count: number, options: UrlGuardOptions = {}): void {
  if (count > (options.maxRedirects ?? 10)) throw new UrlSecurityError("UNSAFE_ADDRESS");
}
