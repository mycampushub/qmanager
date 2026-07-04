/// <reference types="@cloudflare/workers-types" />

// =============================================================================
// QueueFlow — Cloudflare Workers Type Declarations
//
// Extends the global CloudflareEnv (from @opennextjs/cloudflare) with
// application-specific bindings: D1 database, R2 storage, KV rate limiting.
//
// All D1/R2/KV types are globally declared by @cloudflare/workers-types.
// =============================================================================

declare global {
  // ─── Cloudflare Env Bindings ───────────────────────────────────────────────

  interface CloudflareEnv {
    /** D1 — Primary SQLite database for all application data */
    DB: D1Database;

    /** R2 — Object storage for uploaded images, logos, etc. */
    STORAGE: R2Bucket;

    /** KV — Rate limiting & ephemeral caching */
    RATE_LIMIT_KV: KVNamespace;
  }

  // ─── Fix Body.json() return type ──────────────────────────────────────────
  // @cloudflare/workers-types overrides Body.json() to return Promise<unknown>,
  // but the codebase expects Promise<any> (standard DOM behavior) for
  // convenient destructuring: const { email } = await req.json()
  interface Body {
    json(): Promise<any>;
  }
}

export {};