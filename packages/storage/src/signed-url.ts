import crypto from "node:crypto";

/**
 * Simulates S3 presigned URLs for the local-filesystem adapter: an
 * HMAC-signed token over (key, expiry) that the API's evidence route
 * verifies before serving the file. This is what "private object
 * storage, accessible only through authorized links" (Phase 4 security
 * spec) means for a deployment that isn't using real S3 — swapping to
 * `S3ObjectStorage` later replaces this with real presigned URLs from
 * the AWS SDK; callers only ever see the `ObjectStorage.getSignedUrl()`
 * interface, never this implementation detail.
 */
export function signToken(key: string, expiresAtMs: number, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${key}:${expiresAtMs}`);
  return hmac.digest("hex");
}

export interface VerifyResult {
  valid: boolean;
  reason?: "expired" | "invalid_signature";
}

export function verifyToken(key: string, expiresAtMs: number, token: string, secret: string): VerifyResult {
  if (Date.now() > expiresAtMs) return { valid: false, reason: "expired" };

  const expected = signToken(key, expiresAtMs, secret);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(token, "hex");
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: "invalid_signature" };
  }
  return { valid: true };
}
