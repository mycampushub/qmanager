import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db, withTenantCtx } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// GET: Wallet balance, usage stats, and transaction history
// A11: TODO — PLATFORM_ADMIN wallet reads should have an audit trail for sensitive financial data access
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const effectiveTenantId = user.tenantId || req.nextUrl.searchParams.get('tenantId');
      if (!effectiveTenantId) {
        return NextResponse.json(
          { error: 'tenantId is required (in query params for PLATFORM_ADMIN)' },
          { status: 400 }
        );
      }

      // Read Tenant metadata from the correct DB based on user context
      const tenant = await db.tenant.findUnique({
        where: { id: effectiveTenantId },
        select: {
          id: true,
          name: true,
          walletBalance: true,
          planTier: true,
        },
      });

      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        );
      }

      // Tenant-specific queries (tickets, usage, transactions) go to the tenant DB
      const { todayTickets, totalCharges, transactions } = await withTenantCtx(effectiveTenantId, async () => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [tt, tc, tr] = await Promise.all([
          db.ticket.count({
            where: {
              tenantId: effectiveTenantId,
              createdAt: { gte: todayStart },
              status: { notIn: ['CANCELLED'] },
            },
          }),
          db.usageLedger.aggregate({
            where: { tenantId: effectiveTenantId },
            _sum: { costCents: true },
          }),
          db.transaction.findMany({
            where: { tenantId: effectiveTenantId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              id: true,
              type: true,
              amountCents: true,
              description: true,
              createdBy: true,
              createdAt: true,
            },
          }),
        ]);

        return { todayTickets: tt, totalCharges: tc, transactions: tr };
      });

      return NextResponse.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          planTier: tenant.planTier,
          walletBalance: tenant.walletBalance,
        },
        usage: {
          todayTickets,
          totalCharged: totalCharges._sum.costCents || 0,
        },
        transactions,
      });
    } catch (error) {
      console.error('Get wallet error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);

// POST: Top-up wallet
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId, amountCents, description } = body as {
        tenantId: string;
        amountCents: number;
        description?: string;
      };

      if (!tenantId || !amountCents || amountCents <= 0) {
        return NextResponse.json(
          { error: 'tenantId and positive amountCents are required' },
          { status: 400 }
        );
      }

      // B7: Validate amountCents is a positive integer ≤ 100,000,000
      if (!Number.isInteger(amountCents) || amountCents > 100000000) {
        return NextResponse.json(
          { error: 'amountCents must be a positive integer ≤ 100,000,000' },
          { status: 400 }
        );
      }

      // MANAGER can only top-up own tenant
      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only top-up your own tenant' },
          { status: 403 }
        );
      }

      // Wallet operations go to the tenant DB
      const result = await withTenantCtx(tenantId, async () => {
        return db.$transaction(async (tx) => {
          const updated = await tx.tenant.update({
            where: { id: tenantId },
            data: { walletBalance: { increment: amountCents } },
          });

          const transaction = await tx.transaction.create({
            data: {
              tenantId,
              type: 'TOP_UP',
              amountCents,
              description: description || `Wallet top-up`,
              createdBy: user.userId,
            },
          });

          return { updated, transaction };
        });
      });

      // Audit log (platform DB)
      const ip =
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        'unknown';

      await db.auditLog.create({
        data: {
          userId: user.userId,
          userType: user.type,
          action: 'WALLET_TOP_UP',
          details: JSON.stringify({
            tenantId,
            amountCents,
            description,
            newBalance: result.updated.walletBalance,
          }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({
        success: true,
        walletBalance: result.updated.walletBalance,
        transaction: result.transaction,
      });
    } catch (error) {
      console.error('Top-up wallet error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);