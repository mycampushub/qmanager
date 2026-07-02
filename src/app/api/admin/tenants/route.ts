import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(
  async (req: NextRequest, _ctx: { user: JwtPayload }) => {
    try {
      const d1 = getD1FromEnv();
      const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
      const limit = Math.min(
        parseInt(req.nextUrl.searchParams.get('limit') || '20', 10),
        100
      );
      const search = req.nextUrl.searchParams.get('search') || '';

      // B10: Clamp page ≥ 1, limit 1-100
      const safePage = isNaN(page) || page < 1 ? 1 : page;
      const safeLimit = isNaN(limit) || limit < 1 ? 20 : Math.min(limit, 100);

      // B14: Max length 200 for search
      const trimmedSearch = search.slice(0, 200);

      // Build WHERE clause
      let whereClause = '';
      const whereBinds: unknown[] = [];
      if (trimmedSearch) {
        whereClause = ' WHERE t.name LIKE ?';
        whereBinds.push(`%${trimmedSearch}%`);
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      const [countResult, tenantResult] = await d1.batch([
        d1.prepare(`SELECT count(*) as cnt FROM tenants t${whereClause}`).bind(...whereBinds),
        d1.prepare(
          `SELECT t.id, t.name, t.plan_tier, t.wallet_balance, t.is_active, t.master_tenant_id,
                  t.created_at, t.updated_at,
                  mt.id as mt_id, mt.corporate_name as mt_name,
                  (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active = 1) as staff_count
           FROM tenants t
           LEFT JOIN master_tenants mt ON t.master_tenant_id = mt.id
           ${whereClause}
           ORDER BY t.created_at DESC
           LIMIT ? OFFSET ?`
        ).bind(...whereBinds, safeLimit, (safePage - 1) * safeLimit),
      ]);

      const total = ((countResult.results as { cnt: number }[])[0]?.cnt) ?? 0;

      type TenantRow = {
        id: string; name: string; plan_tier: string; wallet_balance: number;
        is_active: number; master_tenant_id: string | null; created_at: string; updated_at: string;
        mt_id: string | null; mt_name: string | null; staff_count: number;
      };

      const tenantRows = (tenantResult.results as TenantRow[]) ?? [];

      // Enrich with today's ticket count
      const enriched = await Promise.all(
        tenantRows.map(async (tenant) => {
          let todayTicketCount = 0;
          try {
            const ticketCount = await d1
              .prepare('SELECT count(*) as cnt FROM tickets WHERE tenant_id = ? AND created_at >= ?')
              .bind(tenant.id, todayISO)
              .first<{ cnt: number }>();
            todayTicketCount = ticketCount?.cnt ?? 0;
          } catch {
            // query failed
          }

          return {
            id: tenant.id,
            name: tenant.name,
            planTier: tenant.plan_tier,
            walletBalance: tenant.wallet_balance,
            isActive: tenant.is_active === 1,
            masterTenant: tenant.mt_id ? { id: tenant.mt_id, corporateName: tenant.mt_name } : null,
            staffCount: tenant.staff_count,
            todayTicketCount,
            createdAt: tenant.created_at,
            updatedAt: tenant.updated_at,
          };
        })
      );

      return NextResponse.json({
        tenants: enriched,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit),
        },
      });
    } catch (error) {
      console.error('Admin tenants error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);