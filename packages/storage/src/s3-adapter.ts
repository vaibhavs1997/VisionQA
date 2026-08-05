import { ObjectStorage, PutObjectInput } from "./object-storage";

export interface S3ObjectStorageOptions {
  bucket: string;
  region: string;
  /** S3-compatible endpoint override (for R2, MinIO, etc.) — omit for
   * real AWS S3. */
  endpoint?: string;
}

/**
 * NOT exercised in this project's own environment — there is no AWS
 * account, bucket, or credentials available here, so this is a real,
 * correctly-structured implementation against the `@aws-sdk/client-s3`
 * API surface, provided so the Phase 4 → production swap is a class
 * change (see LocalFilesystemObjectStorage's doc comment), not a
 * redesign. Treat this as reviewed-but-unverified, the same honesty
 * standard applied to AnthropicProvider in Phase 2: the code follows the
 * SDK correctly, but has not actually been run against a real bucket.
 *
 * To actually use this, install `@aws-sdk/client-s3` and
 * `@aws-sdk/s3-request-presigner`, then uncomment the implementation
 * below (left commented so this package's default install/build/test
 * doesn't require pulling in the AWS SDK for a class nothing in this
 * codebase actually instantiates yet).
 */
export class S3ObjectStorage implements ObjectStorage {
  constructor(private readonly options: S3ObjectStorageOptions) {
    throw new Error(
      "S3ObjectStorage is a documented stub, not wired up in this environment (no AWS credentials/bucket " +
        "available to verify against). See this file's module comment for what's needed to activate it."
    );
  }

  async putObject(_input: PutObjectInput): Promise<void> {
    throw new Error("not implemented — see module comment");
    /*
    import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
    const client = new S3Client({ region: this.options.region, endpoint: this.options.endpoint });
    await client.send(new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }));
    */
  }

  async getObject(_key: string): Promise<Buffer | null> {
    throw new Error("not implemented — see module comment");
  }

  async deleteObject(_key: string): Promise<void> {
    throw new Error("not implemented — see module comment");
  }

  async getSignedUrl(_key: string, _expiresInSeconds?: number): Promise<string> {
    throw new Error("not implemented — see module comment");
    /*
    import { GetObjectCommand } from "@aws-sdk/client-s3";
    import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
    const client = new S3Client({ region: this.options.region, endpoint: this.options.endpoint });
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.options.bucket, Key: key }), {
      expiresIn: expiresInSeconds ?? 3600,
    });
    */
  }

  async deleteObjectsOlderThan(_prefix: string, _olderThanMs: number): Promise<number> {
    throw new Error("not implemented — see module comment");
  }

  async listObjects(_prefix: string): Promise<import("./object-storage").ObjectMetadata[]> {
    throw new Error("not implemented — see module comment");
    /*
    import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
    const client = new S3Client({ region: this.options.region, endpoint: this.options.endpoint });
    const response = await client.send(
      new ListObjectsV2Command({ Bucket: this.options.bucket, Prefix: prefix })
    );
    return (response.Contents ?? [])
      .map((obj) => ({ key: obj.Key!, lastModifiedMs: obj.LastModified?.getTime() ?? 0 }))
      .sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
    */
  }
}
