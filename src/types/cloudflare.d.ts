// =============================================================================
// QueueFlow — Cloudflare Bindings Type Declaration
// Extends the CloudflareEnv interface from @opennextjs/cloudflare
// with our custom bindings (DB, STORAGE, RATE_LIMIT_KV).
// =============================================================================

import '@opennextjs/cloudflare';

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    STORAGE: R2Bucket;
    RATE_LIMIT_KV: KVNamespace;
  }
}

export {};