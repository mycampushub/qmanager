// =============================================================================
// QueueFlow — D1 Database Client
//
// Architecture: Single D1 database. Tenant isolation via WHERE tenant_id = ?.
// In local dev: falls back to better-sqlite3 (LocalD1 shim) via dynamic import.
// In production (CF Workers): uses the real D1 binding from wrangler.toml.
//
// Usage in API routes:
//   import { getD1FromEnv } from '@/lib/db';
//   const d1 = await getD1FromEnv();
//   const row = d1.prepare('SELECT ...').bind(...).first<RowType>();
// =============================================================================

// Cache for the local D1 instance (avoids re-importing on every call)
let _localD1Cache: D1Database | null = null;
let _localD1Promise: Promise<D1Database> | null = null;

/**
 * Get a D1-compatible database instance.
 * - On CF Workers: uses the real D1 binding from wrangler.toml (env.DB)
 * - On local dev with wrangler: also uses the real D1 binding
 * - On local dev without wrangler: dynamically imports better-sqlite3 shim
 *
 * The dynamic import ensures that better-sqlite3, fs, and path are never
 * statically analyzed during the Cloudflare Workers build.
 *
 * Returns synchronously when a D1 binding is available (the common case).
 * Falls back to async dynamic import only for local dev without wrangler.
 */
export async function getD1FromEnv(env?: Record<string, unknown>): Promise<D1Database> {
  // On CF Workers, the D1 binding is injected via env.DB (from wrangler.toml).
  // On local dev with `wrangler dev`, it may also be available as globalThis.DB.
  const d1 = (env ?? globalThis as unknown as Record<string, unknown>)?.DB as D1Database | undefined;
  if (d1) return d1;

  // Return cached local instance if already loaded
  if (_localD1Cache) return _localD1Cache;

  // Dynamic import — the bundler will NOT statically analyze './local-d1'
  // and its Node.js dependencies (better-sqlite3, fs, path).
  // This code path is only reached in local dev without wrangler.
  if (!_localD1Promise) {
    _localD1Promise = import('./local-d1').then((mod) => {
      _localD1Cache = mod.getLocalD1() as D1Database;
      return _localD1Cache;
    }).catch((err) => {
      throw new Error(
        `[QueueFlow] No D1 database binding found and local fallback failed.\n` +
        `If running on Cloudflare Workers, ensure DB is bound in wrangler.toml.\n` +
        `If running locally, ensure better-sqlite3 is installed.\n` +
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }

  return _localD1Promise;
}