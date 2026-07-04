import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { dbNow } from '@/lib/datetime';
import { getClientIp } from '@/lib/utils';

const PAYMENT_METHODS = ['bkash', 'nagad', 'bank_transfer', 'rocket', 'cash', 'admin_credit'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  bank_transfer: 'Bank Transfer',
  rocket: 'Rocket',
  cash: 'Cash',
  admin_credit: 'Admin Credit',
};

const MIN_AMOUNT_CENTS = 100; // 1 TK

// ─── POST: Create payment intent (PLATFORM_ADMIN only) ────────────────────────
// Creates a PENDING CREDIT transaction that must be confirmed later via PUT.

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { tenantId, amountCents, method, description } = body as {
        tenantId?: string;
        amountCents: number;
        method?: string;
        description?: string;
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

      if (!Number.isInteger(amountCents) || amountCents > 100000000) {
        return NextResponse.json(
          { error: 'amountCents must be a positive integer ≤ 100,000,000' },
          { status: 400 }
        );
      }

      // Validate payment method
      const paymentMethod: PaymentMethod | undefined = method as PaymentMethod | undefined;
      if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod)) {
        return NextResponse.json(
          { error: `method must be one of: ${PAYMENT_METHODS.join(', ')}` },
          { status: 400 }
        );
      }

      // Verify tenant exists
      const tenant = await d1
        .prepare('SELECT id, name, wallet_balance FROM tenants WHERE id = ?')
        .bind(effectiveTenantId)
        .first<{ id: string; name: string; wallet_balance: number }>();

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      const transactionId = crypto.randomUUID();
      const now = dbNow();
      const methodLabel = METHOD_LABELS[paymentMethod];
      const paymentDescription =
        description || `Payment via ${methodLabel} (PENDING)`;

      // Create a PENDING CREDIT transaction
      await d1
        .prepare(
          `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by, created_at)
           VALUES (?, ?, 'CREDIT', ?, ?, ?, ?)`
        )
        .bind(transactionId, effectiveTenantId, amountCents, paymentDescription, user.userId, now)
        .run();

      // Audit log for payment creation
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
           VALUES (?, ?, ?, 'PAYMENT_CREATE', ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          JSON.stringify({
            transactionId,
            tenantId: effectiveTenantId,
            amountCents,
            method: paymentMethod,
          }),
          ip
        )
        .run();

      return NextResponse.json(
        {
          transaction: {
            id: transactionId,
            tenantId: effectiveTenantId,
            type: 'CREDIT',
            amountCents,
            description: paymentDescription,
            method: paymentMethod,
            status: 'PENDING',
            createdBy: user.userId,
            createdAt: now,
          },
          currentWalletBalance: tenant.wallet_balance,
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

// ─── PUT: Confirm payment (PLATFORM_ADMIN only) ───────────────────────────────
// Atomically: updates PENDING → CONFIRMED in description, credits wallet, and
// inserts an audit log — all inside a single d1.batch().

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { transactionId } = body as {
        transactionId: string;
      };

      if (!transactionId) {
        return NextResponse.json({ error: 'transactionId is required' }, { status: 400 });
      }

      // Fetch the pending transaction
      const transaction = await d1
        .prepare(
          `SELECT id, tenant_id, type, amount_cents, description, created_by, created_at
           FROM transactions WHERE id = ?`
        )
        .bind(transactionId)
        .first<{
          id: string;
          tenant_id: string;
          type: string;
          amount_cents: number;
          description: string | null;
          created_by: string | null;
          created_at: string;
        }>();

      if (!transaction) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      }

      if (transaction.type !== 'CREDIT') {
        return NextResponse.json(
          { error: 'Only CREDIT transactions can be confirmed' },
          { status: 400 }
        );
      }

      // Check PENDING status via description
      if (!transaction.description?.includes('(PENDING)')) {
        return NextResponse.json({ error: 'Transaction is not in PENDING status' }, { status: 400 });
      }

      // Verify tenant still exists
      const tenant = await d1
        .prepare('SELECT id, wallet_balance FROM tenants WHERE id = ?')
        .bind(transaction.tenant_id)
        .first<{ id: string; wallet_balance: number }>();

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      const now = dbNow();
      const confirmedDescription = transaction.description!.replace('(PENDING)', '(CONFIRMED)');
      const ip = getClientIp(req);

      // ─── Atomic batch: confirm transaction + credit wallet + audit log ───
      await d1.batch([
        // 1. Update transaction description: PENDING → CONFIRMED
        d1
          .prepare(`UPDATE transactions SET description = ? WHERE id = ?`)
          .bind(confirmedDescription, transactionId),
        // 2. Credit the tenant's wallet balance
        d1
          .prepare(
            `UPDATE tenants SET wallet_balance = wallet_balance + ?, updated_at = ? WHERE id = ?`
          )
          .bind(transaction.amount_cents, now, transaction.tenant_id),
        // 3. Insert audit log
        d1
          .prepare(
            `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
             VALUES (?, ?, ?, 'PAYMENT_CONFIRM', ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            user.userId,
            user.type,
            JSON.stringify({
              transactionId,
              tenantId: transaction.tenant_id,
              amountCents: transaction.amount_cents,
              confirmedBy: user.userId,
            }),
            ip
          ),
      ]);

      const newWalletBalance = tenant.wallet_balance + transaction.amount_cents;

      return NextResponse.json({
        success: true,
        walletBalance: newWalletBalance,
        transaction: {
          id: transaction.id,
          tenantId: transaction.tenant_id,
          type: transaction.type,
          amountCents: transaction.amount_cents,
          description: confirmedDescription,
          status: 'CONFIRMED',
          createdBy: transaction.created_by,
          createdAt: transaction.created_at,
          confirmedBy: user.userId,
          confirmedAt: now,
        },
      });
    } catch (error: unknown) {
      console.error('Confirm payment error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);