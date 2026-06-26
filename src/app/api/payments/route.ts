import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

const PAYMENT_METHODS = ['bKash', 'Nagad', 'Bank Transfer', 'Rocket'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const MIN_AMOUNT_CENTS = 100; // 1 TK

// ─── POST: Create payment intent (PLATFORM_ADMIN only) ─────────
// C-03: Only platform admins can create payment intents — prevents self-service free credits

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId, amountCents } = body as {
        tenantId?: string;
        amountCents: number;
      };

      const effectiveTenantId = tenantId || user.tenantId;
      if (!effectiveTenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
        );
      }

      if (!amountCents || typeof amountCents !== 'number' || amountCents < MIN_AMOUNT_CENTS) {
        return NextResponse.json(
          { error: `amountCents must be at least ${MIN_AMOUNT_CENTS} (1 TK)` },
          { status: 400 }
        );
      }

      // Verify tenant exists
      const tenant = await db.tenant.findUnique({
        where: { id: effectiveTenantId },
        select: { id: true, name: true },
      });
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      // Create a PAYMENT transaction (negative amount, simulates pending payment)
      const payment = await db.transaction.create({
        data: {
          tenantId: effectiveTenantId,
          type: 'PAYMENT',
          amountCents: -amountCents, // negative: debit
          description: 'Pending payment',
          createdBy: user.userId,
        },
      });

      return NextResponse.json(
        {
          paymentId: payment.id,
          amountCents,
          status: 'PENDING',
          paymentMethods: [...PAYMENT_METHODS],
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Create payment error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);

// ─── PUT: Confirm payment (PLATFORM_ADMIN only) ───────────────
// C-03: Only platform admins can confirm payments — requires admin verification

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { paymentId, method } = body as {
        paymentId: string;
        method?: string;
      };

      if (!paymentId) {
        return NextResponse.json(
          { error: 'paymentId is required' },
          { status: 400 }
        );
      }

      // Validate method if provided
      if (method && !PAYMENT_METHODS.includes(method as PaymentMethod)) {
        return NextResponse.json(
          { error: `method must be one of: ${PAYMENT_METHODS.join(', ')}` },
          { status: 400 }
        );
      }

      const result = await db.$transaction(async (tx) => {
        // Fetch payment transaction
        const payment = await tx.transaction.findUnique({
          where: { id: paymentId },
        });

        if (!payment) {
          throw new Error('Payment not found');
        }

        if (payment.type !== 'PAYMENT') {
          throw new Error('Invalid payment ID');
        }

        // Check if already confirmed (non-negative means it was reversed)
        if (payment.amountCents >= 0) {
          throw new Error('Payment already confirmed');
        }

        const topUpAmount = Math.abs(payment.amountCents);
        const methodLabel = method || 'Unknown';

        // Update payment description with method
        await tx.transaction.update({
          where: { id: paymentId },
          data: {
            amountCents: 0, // Mark as processed (zeroed out)
            description: `Payment confirmed via ${methodLabel}`,
          },
        });

        // Credit wallet
        const updatedTenant = await tx.tenant.update({
          where: { id: payment.tenantId },
          data: { walletBalance: { increment: topUpAmount } },
        });

        // Create a TOP_UP transaction for the credit
        const topUpTransaction = await tx.transaction.create({
          data: {
            tenantId: payment.tenantId,
            type: 'TOP_UP',
            amountCents: topUpAmount,
            description: `Wallet top-up via ${methodLabel}`,
            createdBy: user.userId,
          },
        });

        return {
          newBalance: updatedTenant.walletBalance,
          topUpTransaction,
        };
      });

      return NextResponse.json({
        success: true,
        walletBalance: result.newBalance,
        transaction: result.topUpTransaction,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (
        message.includes('not found') ||
        message.includes('Invalid') ||
        message.includes('already confirmed')
      ) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      console.error('Confirm payment error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['PLATFORM_ADMIN'] }
);
