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
    const { allowed, retryAfterMs } = rateLimit('unsubscribe:' + ip, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const { endpoint, tenantId } = body as { endpoint: string; tenantId?: string };

    if (!endpoint) {
      return NextResponse.json(
        { error: 'endpoint is required' },
        { status: 400 }
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required for tenant context routing' },
        { status: 400 }
      );
    }

    // H-14: Always include tenantId filter to prevent cross-tenant deletion
    await withTenantCtx(tenantId, async () => {
      await db.pushSubscription.deleteMany({
        where: { endpoint, tenantId },
      });
    });

    // C7: Always return success regardless of deletion count to prevent information leak
    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Unsubscribe notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}