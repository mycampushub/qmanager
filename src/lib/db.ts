// =============================================================================
// QueueFlow — D1 Database Client
//
// Uses @opennextjs/cloudflare's getCloudflareContext() to access the D1 binding.
// Works on CF Workers (production) and wrangler dev (local).
//
// Usage in API routes:
//   import { getD1FromEnv } from '@/lib/db';
//   const d1 = await getD1FromEnv();
//   const row = d1.prepare('SELECT ...').bind(...).first<RowType>();
// =============================================================================

import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getD1FromEnv(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const d1 = env.DB as D1Database | undefined;
  if (!d1) {
    throw new Error(
      `[QueueFlow] D1 binding (DB) not found.\n` +
      `Ensure DB is bound in wrangler.toml and deployed.`
    );
  }
  return d1;
}