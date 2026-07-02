import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
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

      const d1 = getD1FromEnv();

      // Read tenant metadata
      const tenant = await d1
        .prepare(`SELECT id, name, wallet_balance, plan_tier FROM tenants WHERE id = ?`)
        .bind(effectiveTenantId)
        .first<{ id: string; name: string; wallet_balance: number; plan_tier: string }>();

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      // Today's start (UTC ISO string)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      // Fetch today's tickets (non-cancelled), total charges, and recent transactions in parallel
      const [todayTicketsResult, totalChargesResult, transactionsResult] = await Promise.all([
        d1
          .prepare(`SELECT count(*) as cnt FROM tickets WHERE tenant_id = ? AND created_at >= ? AND status != 'CANCELLED'`)
          .bind(effectiveTenantId, todayISO)
          .first<{ cnt: number }>(),
        d1
          .prepare(`SELECT COALESCE(SUM(cost_cents), 0) as total FROM usage_ledgers WHERE tenant_id = ?`)
          .bind(effectiveTenantId)
          .first<{ total: number }>(),
        d1
          .prepare(
            `SELECT id, type, amount_cents, description, created_by, created_at
             FROM transactions WHERE tenant_id = ?
             ORDER BY created_at DESC LIMIT 20`
          )
          .bind(effectiveTenantId)
          .all<{
            id: string;
            type: string;
            amount_cents: number;
            description: string | null;
            created_by: string | null;
            created_at: string;
          }>(),
      ]);

      const transactions = transactionsResult.results.map((t) => ({
        id: t.id,
        type: t.type,
        amountCents: t.amount_cents,
        description: t.description,
        createdBy: t.created_by,
        createdAt: t.created_at,
      }));

      return NextResponse.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          planTier: tenant.plan_tier,
          walletBalance: tenant.wallet_balance,
        },
        usage: {
          todayTickets: todayTicketsResult?.cnt ?? 0,
          totalCharged: totalChargesResult?.total ?? 0,
        },
        transactions,
      });
    } catch (error) {
      console.error('Get wallet error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

      const d1 = getD1FromEnv();
      const transactionId = crypto.randomUUID();
      const ip =
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';

      // Transactional: increment balance + create transaction record + audit log
      await d1.batch([
        d1
          .prepare(`UPDATE tenants SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(amountCents, tenantId),
        d1
          .prepare(
            `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by) VALUES (?, ?, 'TOP_UP', ?, ?, ?)`
          )
          .bind(transactionId, tenantId, amountCents, description || 'Wallet top-up', user.userId),
        d1
          .prepare(
            `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, 'WALLET_TOP_UP', ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            user.userId,
            user.type,
            JSON.stringify({ tenantId, amountCents, description }),
            ip
          ),
      ]);

      // Fetch updated balance for response
      const updated = await d1
        .prepare(`SELECT wallet_balance FROM tenants WHERE id = ?`)
        .bind(tenantId)
        .first<{ wallet_balance: number }>();

      return NextResponse.json({
        success: true,
        walletBalance: updated?.wallet_balance ?? 0,
        transaction: {
          id: transactionId,
          tenantId,
          type: 'TOP_UP',
          amountCents,
          description: description || 'Wallet top-up',
          createdBy: user.userId,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Top-up wallet error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);