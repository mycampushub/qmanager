import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// Send push notification (and SMS stub)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { tenantId, ticketId, event, message, title, body: notifBody } = body as {
        tenantId: string;
        ticketId: string;
        event: string;
        message?: string;
        title?: string;
        body?: string;
      };

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      if (!title) {
        return NextResponse.json({ error: 'title is required' }, { status: 400 });
      }

      if (!notifBody) {
        return NextResponse.json({ error: 'body is required' }, { status: 400 });
      }

      // C11: Validate event against whitelist
      const VALID_EVENTS = ['TICKET_CALLED', 'TICKET_COMPLETED', 'TICKET_SKIPPED', 'TICKET_CANCELLED', 'QUEUE_UPDATED'];
      if (!ticketId || !event) {
        return NextResponse.json({ error: 'ticketId and event are required' }, { status: 400 });
      }
      if (!VALID_EVENTS.includes(event)) {
        return NextResponse.json(
          { error: `Invalid event type. Allowed: ${VALID_EVENTS.join(', ')}` },
          { status: 400 }
        );
      }

      // A6: Verify tenant access for ALL roles
      if (user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only send notifications for your own tenant' },
          { status: 403 }
        );
      }

      // Find ticket — also verify it belongs to the same tenant
      const ticket = await d1
        .prepare('SELECT id, customer_phone, tenant_id FROM tickets WHERE id = ?')
        .bind(ticketId)
        .first<{ id: string; customer_phone: string | null; tenant_id: string }>();

      if (ticket && ticket.tenant_id !== tenantId) {
        return NextResponse.json(
          { error: 'Ticket does not belong to this tenant' },
          { status: 403 }
        );
      }

      // Look up push subscriptions for this ticket
      const subResult = await d1
        .prepare('SELECT id, endpoint, keys_json FROM push_subscriptions WHERE tenant_id = ? AND ticket_id = ?')
        .bind(tenantId, ticketId)
        .all<{ id: string; endpoint: string; keys_json: string }>();

      let pushSent = 0;

      for (const _sub of subResult.results) {
        // Web Push notification (stub - actual implementation needs VAPID keys)
        pushSent++;
      }

      // SMS stub
      let smsPrepared = false;
      if (ticket?.customer_phone && event === 'TICKET_CALLED') {
        smsPrepared = true;
        console.log(
          `[SMS STUB] Would send to ${ticket.customer_phone}: ${message || 'Your ticket is being served now!'}`
        );
      }

      // Audit log
      const ip =
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        'unknown';

      const now = new Date().toISOString();
      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
         VALUES (?, ?, ?, 'NOTIFICATION_SEND', ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), user.userId, user.type,
        JSON.stringify({ tenantId, ticketId, event, message, pushSent, smsPrepared }),
        ip, now
      ).run();

      return NextResponse.json({ success: true, pushSent, smsPrepared });
    } catch (error) {
      console.error('Send notification error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['AGENT', 'MANAGER'] }
);