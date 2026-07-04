import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { dbNow } from '@/lib/datetime';

const PAYMENT_METHODS = ['bKash', 'Nagad', 'Bank Transfer', 'Rocket'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const MIN_AMOUNT_CENTS = 100; // 1 TK

// ─── POST: Create payment intent (PLATFORM_ADMIN only) ─────────

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { tenantId, amountCents } = body as {
        tenantId?: string;
        amountCents: number;
      };

      const effectiveTenantId = tenantId || user.tenantId;
      if (!effectiveTenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      if (!amountCents || typeof amountCents !== 'number' || amountCents < MIN_AMOUNT_CENTS) {
        return NextResponse.json(
          { error: `amountCents must be at least ${MIN_AMOUNT_CENTS} (1 TK)` },
          { status: 400 }
        );
      }

      // Verify tenant exists
      const tenant = await d1
        .prepare('SELECT id, name FROM tenants WHERE id = ?')
        .bind(effectiveTenantId)
        .first<{ id: string; name: string }>();

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      // Create a PAYMENT transaction (negative amount, simulates pending payment)
      const paymentId = crypto.randomUUID();

      await d1.prepare(
        `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by)
         VALUES (?, ?, 'PAYMENT', ?, 'Pending payment', ?)`
      ).bind(paymentId, effectiveTenantId, -amountCents, user.userId).run();

      return NextResponse.json(
        {
          paymentId,
          amountCents,
          status: 'PENDING',
          paymentMethods: [...PAYMENT_METHODS],
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Create payment error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// ─── PUT: Confirm payment (PLATFORM_ADMIN only) ───────────────

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { paymentId, method } = body as {
        paymentId: string;
        method?: string;
      };

      if (!paymentId) {
        return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
      }

      if (method && !PAYMENT_METHODS.includes(method as PaymentMethod)) {
        return NextResponse.json(
          { error: `method must be one of: ${PAYMENT_METHODS.join(', ')}` },
          { status: 400 }
        );
      }

      // Fetch payment transaction
      const payment = await d1
        .prepare('SELECT id, tenant_id, type, amount_cents FROM transactions WHERE id = ?')
        .bind(paymentId)
        .first<{ id: string; tenant_id: string; type: string; amount_cents: number }>();

      if (!payment) {
        return NextResponse.json({ error: 'Payment not found' }, { status: 400 });
      }

      if (payment.type !== 'PAYMENT') {
        return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 });
      }

      // Check if already confirmed (non-negative means it was reversed)
      if (payment.amount_cents >= 0) {
        return NextResponse.json({ error: 'Payment already confirmed' }, { status: 400 });
      }

      const topUpAmount = Math.abs(payment.amount_cents);
      const methodLabel = method || 'Unknown';
      const now = dbNow();

      // Get current wallet balance before update
      const tenantRow = await d1
        .prepare('SELECT wallet_balance FROM tenants WHERE id = ?')
        .bind(payment.tenant_id)
        .first<{ wallet_balance: number }>();

      if (!tenantRow) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
      }

      const newBalance = tenantRow.wallet_balance + topUpAmount;

      // Execute all in a batch (transaction)
      const topUpId = crypto.randomUUID();

      await d1.batch([
        // Mark payment as processed (zeroed out)
        d1.prepare(
          `UPDATE transactions SET amount_cents = 0, description = ?, created_at = created_at WHERE id = ?`
        ).bind(`Payment confirmed via ${methodLabel}`, paymentId),
        // Credit wallet
        d1.prepare(
          `UPDATE tenants SET wallet_balance = wallet_balance + ?, updated_at = ? WHERE id = ?`
        ).bind(topUpAmount, now, payment.tenant_id),
        // Create TOP_UP transaction
        d1.prepare(
          `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by, created_at)
           VALUES (?, ?, 'TOP_UP', ?, ?, ?, ?)`
        ).bind(topUpId, payment.tenant_id, topUpAmount, `Wallet top-up via ${methodLabel}`, user.userId, now),
      ]);

      // Fetch the created transaction for response
      const topUpTransaction = await d1
        .prepare('SELECT * FROM transactions WHERE id = ?')
        .bind(topUpId)
        .first<Record<string, unknown>>();

      return NextResponse.json({
        success: true,
        walletBalance: newBalance,
        transaction: topUpTransaction,
      });
    } catch (error: unknown) {
      console.error('Confirm payment error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);