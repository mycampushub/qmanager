// =============================================================================
// QueueFlow — Database Client (Cloudflare D1)
//
// Thin wrapper around @opennextjs/cloudflare's getCloudflareContext()
// to provide the D1 database instance to all API routes.
//
// Usage in API routes:
//   import { getD1FromEnv } from '@/lib/db';
//   const d1 = await getD1FromEnv();
//   const row = await d1.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
// =============================================================================

import { getCloudflareContext } from '@opennextjs/cloudflare';

// ─── Re-export Cloudflare global types for convenient importing ──────────────
// These types are declared globally by @cloudflare/workers-types.

/** D1Database — the primary database interface */
type _D1Database = D1Database;
/** BoundStatement — alias for D1PreparedStatement (used in batch calls) */
type _D1PreparedStatement = D1PreparedStatement;
/** D1Result — the result type returned by .all() and .run() */
type _D1Result<T = unknown> = D1Result<T>;

export type { _D1Database as D1Database, _D1PreparedStatement as BoundStatement, _D1Result as D1Result };

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the D1 database instance from the current Cloudflare Workers context.
 * Works in both production (Cloudflare Workers) and local dev (via opennext proxy).
 */
export async function getD1FromEnv(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}