import { NextRequest, NextResponse } from 'next/server';
import { db, withTenantCtx } from '@/lib/db';

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

  const tenant = await db.tenant.findUnique({
    where: { id, isActive: true },
    select: { name: true, isActive: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const queuesWithStats = await withTenantCtx(id, async () => {
    const queues = await db.queue.findMany({
      where: { tenantId: id, isActive: true },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      queues.map(async (q) => {
        const waiting = await db.ticket.count({
          where: { queueId: q.id, status: 'WAITING' },
        });
        return { ...q, _waitingCount: waiting };
      })
    );
  });

  return NextResponse.json({ tenantName: tenant.name, queues: queuesWithStats });
}