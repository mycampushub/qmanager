import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import { rateLimit } from '@/lib/auth';
import { getClientIp } from '@/lib/utils';

// A14: Public endpoint with IP rate limiting
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    const { allowed, retryAfterMs } = await rateLimit('unsubscribe:' + ip, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const d1 = await getD1FromEnv();
    const body = await req.json();
    const { endpoint, tenantId } = body as { endpoint: string; tenantId?: string };

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required for tenant context routing' },
        { status: 400 }
      );
    }

    // H-14: Always include tenantId filter to prevent cross-tenant deletion
    await d1
      .prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND tenant_id = ?')
      .bind(endpoint, tenantId)
      .run();

    // C7: Always return success regardless of deletion count to prevent information leak
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unsubscribe notification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}