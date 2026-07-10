import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';

/**
 * Public endpoint: returns active queues with waiting count for a given tenant.
 * Used by the kiosk (no auth required).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  const d1 = getD1FromEnv();

  const tenant = await d1
    .prepare('SELECT name, is_active FROM tenants WHERE id = ?')
    .bind(id)
    .first<{ name: string; is_active: number }>();

  if (!tenant || tenant.is_active !== 1) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  // Get all active queues for the tenant
  const queuesResult = await d1
    .prepare(
      `SELECT q.id, q.tenant_id, q.name, q.description, q.default_service_time_sec,
              q.prefix, q.current_serial, q.now_serving_serial, q.is_active,
              q.created_at, q.updated_at
       FROM queues q
       WHERE q.tenant_id = ? AND q.is_active = 1
       ORDER BY q.name ASC`
    )
    .bind(id)
    .all<{
      id: string; tenant_id: string; name: string; description: string | null;
      default_service_time_sec: number; prefix: string; current_serial: number;
      now_serving_serial: number; is_active: number; created_at: string; updated_at: string;
    }>();

  // Get waiting counts for all queues in one query
  const queues = queuesResult.results;
  const queueIds = queues.map((q) => q.id);

  let waitingCounts: Record<string, number> = {};
  if (queueIds.length > 0) {
    const placeholders = queueIds.map(() => '?').join(',');
    const countResult = await d1
      .prepare(
        `SELECT queue_id, count(*) as cnt FROM tickets
         WHERE queue_id IN (${placeholders}) AND status = 'WAITING'
         GROUP BY queue_id`
      )
      .bind(...queueIds)
      .all<{ queue_id: string; cnt: number }>();

    for (const row of countResult.results) {
      waitingCounts[row.queue_id] = row.cnt;
    }
  }

  const queuesWithStats = queues.map((q) => ({
    ...q,
    tenantId: q.tenant_id,
    defaultServiceTimeSec: q.default_service_time_sec,
    currentSerial: q.current_serial,
    nowServingSerial: q.now_serving_serial,
    isActive: q.is_active === 1,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    _waitingCount: waitingCounts[q.id] ?? 0,
  }));

  return NextResponse.json({ tenantName: tenant.name, queues: queuesWithStats });
}