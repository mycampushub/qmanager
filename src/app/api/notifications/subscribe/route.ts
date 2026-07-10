import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import { rateLimit } from '@/lib/auth';
import { dbNow } from '@/lib/datetime';
import { getClientIp } from '@/lib/utils';

// A14: Public endpoint with IP rate limiting
export async function POST(req: NextRequest) {
  try {
    // A14: IP-based rate limit (10/min) with A13 fallback
    const ip = getClientIp(req);

    const { allowed, retryAfterMs } = await rateLimit('subscribe:' + ip, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const d1 = await getD1FromEnv();
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

    // Validate tenant exists
    const tenant = await d1
      .prepare('SELECT id FROM tenants WHERE id = ?')
      .bind(tenantId)
      .first<{ id: string }>();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // A15: Max 5 subscriptions per ticket
    if (ticketId) {
      const subCount = await d1
        .prepare('SELECT count(*) as cnt FROM push_subscriptions WHERE ticket_id = ?')
        .bind(ticketId)
        .first<{ cnt: number }>();

      if ((subCount?.cnt ?? 0) >= 5) {
        return NextResponse.json(
          { error: 'Maximum 5 push subscriptions per ticket' },
          { status: 400 }
        );
      }
    }

    // Upsert: delete existing subscription for this endpoint+tenant, then create
    await d1
      .prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND tenant_id = ?')
      .bind(endpoint, tenantId)
      .run();

    const newId = crypto.randomUUID();

    await d1.prepare(
      `INSERT INTO push_subscriptions (id, tenant_id, ticket_id, endpoint, keys_json)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(newId, tenantId, ticketId || null, endpoint, JSON.stringify(keys)).run();

    return NextResponse.json({ success: true, subscriptionId: newId });
  } catch (error) {
    console.error('Subscribe notification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}