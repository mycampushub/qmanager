// =============================================================================
// QueueFlow — Cloudflare Type Declarations
//
// Extends the global CloudflareEnv interface declared by @opennextjs/cloudflare
// with our custom bindings (DB, STORAGE, RATE_LIMIT_KV).
// =============================================================================

declare global {
  interface CloudflareEnv {
    DB: import('@/lib/db').D1Database;
    STORAGE: import('@/lib/db').R2Bucket;
    RATE_LIMIT_KV: import('@/lib/db').KVNamespace;
  }
}

export {};