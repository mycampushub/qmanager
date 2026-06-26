import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db, withTenantCtx } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// GET: List all active tenants (PUBLIC - needed for join page, TV display, kiosk)
export async function GET() {
  try {
    const tenants = await db.tenant.findMany({
      where: { isActive: true },
      include: {
        masterTenant: { select: { id: true, corporateName: true } },
        _count: {
          select: {
            queues: { where: { isActive: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // A2: Strip sensitive fields from public response (walletBalance, brandingConfig)
    const enriched = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      masterTenantId: t.masterTenantId,
      planTier: t.planTier,
      welcomeMessage: t.welcomeMessage,
      logoUrl: t.logoUrl,
      isActive: t.isActive,
      createdAt: t.createdAt,
      masterTenant: t.masterTenant,
      _queueCount: t._count.queues,
    }));

    return NextResponse.json({ tenants: enriched });
  } catch (error) {
    console.error('List tenants error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Get single tenant with queue stats (MANAGER | PLATFORM_ADMIN)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId } = body as { tenantId: string };

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      // MANAGER can only access own tenant
      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json({ error: 'You can only access your own tenant' }, { status: 403 });
      }

      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        include: {
          masterTenant: { select: { id: true, corporateName: true } },
        },
      });

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      // Tenant-specific queries (queues, tickets, serviceLogs) use the tenant DB
      const queuesWithStats = await withTenantCtx(tenantId, async () => {
        const queues = await db.queue.findMany({
          where: { tenantId, isActive: true },
          orderBy: { name: 'asc' },
        });

        return Promise.all(
          queues.map(async (queue) => {
            const [waiting, serving] = await Promise.all([
              db.ticket.count({ where: { queueId: queue.id, status: 'WAITING' } }),
              db.ticket.count({ where: { queueId: queue.id, status: 'SERVING' } }),
            ]);

            // FIX A3: Per-queue EWT using per-queue service logs
            const serviceLogs = await db.serviceLog.findMany({
              where: { tenantId, queueId: queue.id, durationSeconds: { not: null } },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: { durationSeconds: true },
            });

            const avgServiceTime = serviceLogs.length > 0
              ? Math.round(serviceLogs.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / serviceLogs.length)
              : queue.defaultServiceTimeSec;

            return {
              ...queue,
              _waitingCount: waiting,
              _servingCount: serving,
              _avgServiceTime: avgServiceTime,
              _ewt: waiting * avgServiceTime,
            };
          })
        );
      });

      // H-03: Filter sensitive fields from tenant+queues response
      const safeTenant = {
        id: tenant.id,
        name: tenant.name,
        planTier: tenant.planTier,
        masterTenantId: tenant.masterTenantId,
        welcomeMessage: tenant.welcomeMessage,
        logoUrl: tenant.logoUrl,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        masterTenant: tenant.masterTenant,
        queues: queuesWithStats,
      };

      return NextResponse.json({ tenant: safeTenant });
    } catch (error) {
      console.error('Get tenant error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN', 'MANAGER'] }
);