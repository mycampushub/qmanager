// =============================================================================
// QueueFlow — Type Declarations (Local SQLite version)
// =============================================================================

// KVNamespace stub (used only in rate limiting type signature)
interface KVNamespace {
  get<T = unknown>(key: string, type?: string): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// R2Bucket stub (storage routes now use local FS)
interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | ReadableStream, options?: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<void>;
}

interface R2Object {
  body: ReadableStream;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

declare global {
  // Stub CloudflareEnv (not actually used in local dev)
  interface CloudflareEnv {
    DB: import('@/lib/db').D1Database;
    STORAGE: R2Bucket;
    RATE_LIMIT_KV: KVNamespace;
  }
}