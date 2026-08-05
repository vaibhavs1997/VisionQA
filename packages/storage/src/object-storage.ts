export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface ObjectMetadata {
  key: string;
  lastModifiedMs: number;
}

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
  /** Returns a URL (or URL path) that grants time-limited access to the
   * object without requiring the caller to be authenticated against the
   * storage backend directly — for S3 this is a real presigned URL; for
   * the local adapter it's a signed path our own API verifies. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /** Per the Phase 4 retention spec ("configurable screenshot/report
   * retention") — deletes every object whose key is under the given
   * prefix (e.g. `scans/<scanId>/`) older than the given age. */
  deleteObjectsOlderThan(prefix: string, olderThanMs: number): Promise<number>;
  /** Lists objects under a prefix, newest first — used by the backup
   * restore CLI to resolve "restore the latest backup" without the
   * caller needing to know the naming scheme. */
  listObjects(prefix: string): Promise<ObjectMetadata[]>;
}
