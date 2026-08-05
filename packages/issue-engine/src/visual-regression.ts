import { createHash } from "node:crypto";

export function screenshotFingerprint(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function fingerprintsDiffer(a: string, b: string): boolean {
  return a !== b;
}
