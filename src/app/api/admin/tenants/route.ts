import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { getTenantDb } from '@/lib/tenant-db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(
  async (req: NextRequest, _ctx: { user: JwtPayload }) => {
    try {
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

      const where: Record<string, unknown> = {};
      if (search) {
        where.name = { contains: trimmedSearch };
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [tenants, total] = await Promise.all([
        db.tenant.findMany({
          where,
          include: {
            masterTenant: { select: { id: true, corporateName: true } },
            _count: {
              select: {
                users: { where: { isActive: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
        }),
        db.tenant.count({ where }),
      ]);

      // Enrich with today's ticket count (queried from each tenant DB)
      const enriched = await Promise.all(
        tenants.map(async (tenant) => {
          let todayTicketCount = 0;
          try {
            const tdb = getTenantDb(tenant.id);
            todayTicketCount = await tdb.ticket.count({
              where: {
                tenantId: tenant.id,
                createdAt: { gte: todayStart },
              },
            });
          } catch {
            // tenant DB inaccessible
          }

          return {
            id: tenant.id,
            name: tenant.name,
            planTier: tenant.planTier,
            walletBalance: tenant.walletBalance,
            isActive: tenant.isActive,
            masterTenant: tenant.masterTenant,
            staffCount: tenant._count.users,
            todayTicketCount,
            createdAt: tenant.createdAt,
            updatedAt: tenant.updatedAt,
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
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);