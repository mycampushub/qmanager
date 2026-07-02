// =============================================================================
// QueueFlow — D1 Database Client
//
// Architecture: Single D1 database. Tenant isolation via WHERE tenant_id = ?.
// In local dev: falls back to better-sqlite3 (LocalD1 shim).
// In production (CF Workers): uses the real D1 binding from wrangler.toml.
//
// Usage in API routes:
//   import { getD1FromEnv } from '@/lib/db';
//   const d1 = getD1FromEnv();
//   const row = d1.prepare('SELECT ...').bind(...).first<RowType>();
// =============================================================================

import { getLocalD1 } from './local-d1';

// =============================================================================
// Helper: Get D1 from environment (with local fallback)
// =============================================================================

/**
 * Get a D1-compatible database instance.
 * - On CF Workers: uses the real D1 binding from wrangler.toml
 * - On local dev: uses better-sqlite3 wrapped as D1-compatible API
 */
export function getD1FromEnv(env?: Record<string, unknown>): unknown {
  const d1 = (env ?? globalThis as unknown as Record<string, unknown>)?.DB;
  if (d1) return d1;

  // Fallback to local SQLite
  return getLocalD1();
}