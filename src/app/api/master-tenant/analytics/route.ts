import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(
  async (_req: NextRequest, ctx: { user: JwtPayload }) => {
    try {
      const masterTenantId = ctx.user.masterTenantId;
      if (!masterTenantId) {
        return NextResponse.json({ error: 'Not a master tenant admin' }, { status: 403 });
      }

      const d1 = await getD1FromEnv();
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      const [totalResult, completedResult, avgWaitResult, branchResult] = await d1.batch([
        d1.prepare(
          `SELECT count(*) as cnt FROM tickets tk
           JOIN tenants t ON t.id = tk.tenant_id
           WHERE t.master_tenant_id = ? AND tk.created_at >= ?`
        ).bind(masterTenantId, todayISO),
        d1.prepare(
          `SELECT count(*) as cnt FROM tickets tk
           JOIN tenants t ON t.id = tk.tenant_id
           WHERE t.master_tenant_id = ? AND tk.created_at >= ? AND tk.status = 'COMPLETED'`
        ).bind(masterTenantId, todayISO),
        d1.prepare(
          `SELECT COALESCE(avg(
            CAST(strftime('%s', tk.served_at) AS INTEGER) - CAST(strftime('%s', tk.created_at) AS INTEGER)
          ), 0) as avg_wait FROM tickets tk
           JOIN tenants t ON t.id = tk.tenant_id
           WHERE t.master_tenant_id = ? AND tk.created_at >= ? AND tk.served_at IS NOT NULL`
        ).bind(masterTenantId, todayISO),
        d1.prepare(
          `SELECT t.name as branch_name,
                  count(*) as total,
                  sum(CASE WHEN tk.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
                  sum(CASE WHEN tk.status = 'WAITING' THEN 1 ELSE 0 END) as waiting
           FROM tickets tk
           JOIN tenants t ON t.id = tk.tenant_id
           WHERE t.master_tenant_id = ? AND tk.created_at >= ?
           GROUP BY t.name`
        ).bind(masterTenantId, todayISO),
      ]);

      const totalTickets = (
        totalResult.results as { cnt: number }[]
      )[0]?.cnt ?? 0;
      const completedToday = (
        completedResult.results as { cnt: number }[]
      )[0]?.cnt ?? 0;
      const avgWaitTimeSec = Math.round(
        (avgWaitResult.results as { avg_wait: number }[])[0]?.avg_wait ?? 0
      );

      const branchRows = (branchResult.results as {
        branch_name: string;
        total: number;
        completed: number;
        waiting: number;
      }[]) ?? [];

      const branches = branchRows.map((row) => ({
        name: row.branch_name,
        totalTickets: row.total,
        completed: row.completed,
        waiting: row.waiting,
      }));

      return NextResponse.json({
        totalTickets,
        completedToday,
        avgWaitTimeSec,
        branches,
      });
    } catch (error) {
      console.error('Master tenant analytics error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MASTER_TENANT_ADMIN'] }
);
