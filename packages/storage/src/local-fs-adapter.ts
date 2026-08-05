import fs from "node:fs";
import path from "node:path";
import { ObjectStorage, PutObjectInput } from "./object-storage";
import { signToken, verifyToken } from "./signed-url";

export interface LocalFilesystemStorageOptions {
  rootDir: string;
  /** Base URL the API serves signed evidence links from, e.g.
   * "http://localhost:4000/evidence". */
  publicBaseUrl: string;
  /** HMAC secret for signing URLs — MUST be a real secret in production,
   * not the fallback dev value. */
  signingSecret?: string;
}

function safeJoin(rootDir: string, key: string): string {
  const resolved = path.resolve(rootDir, key);
  if (!resolved.startsWith(path.resolve(rootDir))) {
    throw new Error(`Refusing to write outside storage root: ${key}`);
  }
  return resolved;
}

/**
 * A real, working ObjectStorage implementation backed by the local
 * filesystem — this is what actually runs in this project's own dev/CI
 * environment (no S3 bucket available), and it's a legitimate deployment
 * option for anyone self-hosting rather than using AWS. Swapping to
 * `S3ObjectStorage` for a managed cloud deployment is a one-class change
 * behind the same `ObjectStorage` interface — nothing that calls
 * `getSignedUrl()`/`putObject()`/etc. needs to know which one is active.
 */
export class LocalFilesystemObjectStorage implements ObjectStorage {
  private readonly rootDir: string;
  private readonly publicBaseUrl: string;
  private readonly signingSecret: string;

  constructor(options: LocalFilesystemStorageOptions) {
    this.rootDir = options.rootDir;
    this.publicBaseUrl = options.publicBaseUrl;
    this.signingSecret = options.signingSecret ?? process.env.STORAGE_SIGNING_SECRET ?? "dev-only-insecure-secret";
    fs.mkdirSync(this.rootDir, { recursive: true });

    if (!options.signingSecret && !process.env.STORAGE_SIGNING_SECRET) {
      // eslint-disable-next-line no-console
      console.warn(
        "[storage] STORAGE_SIGNING_SECRET is not set — using an insecure development default. " +
          "Set a real secret before deploying anywhere evidence URLs matter."
      );
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const filePath = safeJoin(this.rootDir, input.key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, input.body);
  }

  async getObject(key: string): Promise<Buffer | null> {
    const filePath = safeJoin(this.rootDir, key);
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = safeJoin(this.rootDir, key);
    fs.rmSync(filePath, { force: true });
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const expiresAtMs = Date.now() + expiresInSeconds * 1000;
    const token = signToken(key, expiresAtMs, this.signingSecret);
    return `${this.publicBaseUrl}/${encodeURIComponent(key)}?expires=${expiresAtMs}&token=${token}`;
  }

  async deleteObjectsOlderThan(prefix: string, olderThanMs: number): Promise<number> {
    const dir = safeJoin(this.rootDir, prefix);
    if (!fs.existsSync(dir)) return 0;

    const cutoff = Date.now() - olderThanMs;
    let deletedCount = 0;

    function walk(currentDir: string) {
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(entryPath);
          continue;
        }
        const stat = fs.statSync(entryPath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(entryPath, { force: true });
          deletedCount++;
        }
      }
    }
    walk(dir);
    return deletedCount;
  }

  /** Verifies a signed URL's token — used by the API's evidence route. */
  verifySignedAccess(key: string, expiresAtMs: number, token: string) {
    return verifyToken(key, expiresAtMs, token, this.signingSecret);
  }

  async listObjects(prefix: string): Promise<import("./object-storage").ObjectMetadata[]> {
    const dir = safeJoin(this.rootDir, prefix);
    if (!fs.existsSync(dir)) return [];

    const results: import("./object-storage").ObjectMetadata[] = [];
    const rootResolved = path.resolve(this.rootDir);

    function walk(currentDir: string) {
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(entryPath);
          continue;
        }
        const stat = fs.statSync(entryPath);
        const key = path.relative(rootResolved, entryPath).split(path.sep).join("/");
        results.push({ key, lastModifiedMs: stat.mtimeMs });
      }
    }
    walk(dir);

    return results.sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
  }
}
