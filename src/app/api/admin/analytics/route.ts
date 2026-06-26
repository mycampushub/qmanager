import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { aggregateAcrossTenants } from '@/lib/aggregate-tenants';

// C4: Accept (req, ctx) parameters for future extensibility
export const GET = withAuth(async (_req: NextRequest, _ctx: { user: unknown }) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Platform-level stats
    const [totalTenants, activeTenants, newTenantsThisMonth, totalStaff] = await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { isActive: true } }),
      db.tenant.count({ where: { createdAt: { gte: monthStart } } }),
      db.staffUser.count({ where: { isActive: true } }),
    ]);

    // Cross-tenant aggregation (tickets, revenue, queues across all tenant DBs)
    const tenantAgg = await aggregateAcrossTenants();

    return NextResponse.json({
      totalTenants,
      activeTenants,
      newTenantsThisMonth,
      totalTickets: tenantAgg.totalTickets,
      totalTicketsToday: tenantAgg.totalTicketsToday,
      completedToday: tenantAgg.completedToday,
      totalRevenue: tenantAgg.totalRevenue,
      totalStaff,
      totalQueues: tenantAgg.totalQueues,
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}, { roles: ['PLATFORM_ADMIN'] });