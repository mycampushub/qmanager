import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { aggregateAcrossTenants } from '@/lib/aggregate-tenants';

// C4: Accept (req, ctx) parameters for future extensibility
export const GET = withAuth(async (_req: NextRequest, _ctx: { user: unknown }) => {
  try {
    const d1 = await getD1FromEnv();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartISO = monthStart.toISOString();

    // Platform-level stats
    const [tenantStats, activeStats, newMonthStats, staffStats] = await d1.batch([
      d1.prepare('SELECT count(*) as cnt FROM tenants').bind(),
      d1.prepare('SELECT count(*) as cnt FROM tenants WHERE is_active = 1').bind(),
      d1.prepare('SELECT count(*) as cnt FROM tenants WHERE created_at >= ?').bind(monthStartISO),
      d1.prepare('SELECT count(*) as cnt FROM users WHERE is_active = 1').bind(),
    ]);

    const totalTenants = ((tenantStats.results as { cnt: number }[])[0]?.cnt) ?? 0;
    const activeTenants = ((activeStats.results as { cnt: number }[])[0]?.cnt) ?? 0;
    const newTenantsThisMonth = ((newMonthStats.results as { cnt: number }[])[0]?.cnt) ?? 0;
    const totalStaff = ((staffStats.results as { cnt: number }[])[0]?.cnt) ?? 0;

    // Cross-tenant aggregation
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}, { roles: ['PLATFORM_ADMIN'] });