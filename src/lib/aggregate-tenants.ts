// =============================================================================
// QueueFlow — Cross-Tenant Aggregation (D1 compatible)
// Replaces: src/lib/aggregate-tenants.ts
//
// Changes: Single D1 database — no per-tenant SQLite files.
//   Uses SQL GROUP BY for efficient cross-tenant aggregation.
// =============================================================================

import { getD1FromEnv } from './db';

export interface TenantAggregates {
  totalTickets: number;
  totalTicketsToday: number;
  completedToday: number;
  totalRevenue: number;
  totalQueues: number;
}

export async function aggregateAcrossTenants(): Promise<TenantAggregates> {
  const d1 = await getD1FromEnv();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  // Single query aggregation — much faster than per-tenant loops
  const results = await d1.batch([
    d1.prepare('SELECT count(*) as cnt FROM tickets').bind(),
    d1.prepare('SELECT count(*) as cnt FROM tickets WHERE created_at >= ?').bind(todayISO),
    d1.prepare('SELECT count(*) as cnt FROM tickets WHERE created_at >= ? AND status = ?').bind(todayISO, 'COMPLETED'),
    d1.prepare('SELECT COALESCE(SUM(cost_cents), 0) as total FROM usage_ledgers').bind(),
    d1.prepare('SELECT count(*) as cnt FROM queues WHERE is_active = 1').bind(),
  ]);

  return {
    totalTickets: (results[0].results as { cnt: number }[])[0]?.cnt ?? 0,
    totalTicketsToday: (results[1].results as { cnt: number }[])[0]?.cnt ?? 0,
    completedToday: (results[2].results as { cnt: number }[])[0]?.cnt ?? 0,
    totalRevenue: (results[3].results as { total: number }[])[0]?.total ?? 0,
    totalQueues: (results[4].results as { cnt: number }[])[0]?.cnt ?? 0,
  };
}