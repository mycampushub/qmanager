// =============================================================================
// QueueFlow — D1 Database Client
//
// Single D1 database. Tenant isolation via WHERE tenant_id = ?.
// Requires a D1 binding (env.DB) — use `wrangler dev` locally or deploy to CF Workers.
//
// Usage in API routes:
//   import { getD1FromEnv } from '@/lib/db';
//   const d1 = await getD1FromEnv();
//   const row = d1.prepare('SELECT ...').bind(...).first<RowType>();
// =============================================================================

/**
 * Get the D1 database instance from the environment.
 * Works on CF Workers (env.DB from wrangler.toml) and `wrangler dev` locally.
 */
export async function getD1FromEnv(env?: Record<string, unknown>): Promise<D1Database> {
  const d1 = (env ?? globalThis as unknown as Record<string, unknown>)?.DB as D1Database | undefined;
  if (!d1) {
    throw new Error(
      `[QueueFlow] D1 database binding (DB) not found.\n` +
      `Use "wrangler dev" for local development or deploy to Cloudflare Workers.`
    );
  }
  return d1;
}