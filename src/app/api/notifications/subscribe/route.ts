import { NextRequest, NextResponse } from 'next/server';
import { db, withTenantCtx } from '@/lib/db';
import { rateLimit } from '@/lib/auth';

// A14: Public endpoint with IP rate limiting
export async function POST(req: NextRequest) {
  try {
    // A14: IP-based rate limit (10/min) with A13 fallback
    const ipForwarded = req.headers.get('x-forwarded-for');
    const ip = ipForwarded || req.headers.get('x-real-ip') ||
      // @ts-expect-error NextRequest extends Request, connection may not be typed
      (req.connection?.remoteAddress as string) || 'unknown';
    const { allowed, retryAfterMs } = rateLimit('subscribe:' + ip, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const { tenantId, ticketId, endpoint, keys } = body as {
      tenantId: string;
      ticketId?: string;
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    if (!tenantId || !endpoint || !keys) {
      return NextResponse.json(
        { error: 'tenantId, endpoint, and keys are required' },
        { status: 400 }
      );
    }

    // Validate tenant exists (platform DB)
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Tenant-specific operations (push subscriptions in tenant DB)
    const subscription = await withTenantCtx(tenantId, async () => {
      // A15: Max 5 subscriptions per ticket
      if (ticketId) {
        const subCount = await db.pushSubscription.count({
          where: { ticketId },
        });
        if (subCount >= 5) {
          throw new Error('Maximum 5 push subscriptions per ticket');
        }
      }

      // Upsert: delete existing subscription for this endpoint+tenant, then create
      await db.pushSubscription.deleteMany({ where: { endpoint, tenantId } });

      return db.pushSubscription.create({
        data: {
          tenantId,
          ticketId: ticketId || null,
          endpoint,
          keysJson: JSON.stringify(keys),
        },
      });
    });

    return NextResponse.json({ success: true, subscriptionId: subscription.id });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Maximum 5 push subscriptions per ticket') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Subscribe notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}