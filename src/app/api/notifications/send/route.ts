import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { getClientIp } from '@/lib/utils';
import { sendWebPush } from '@/lib/web-push';

// Send push notification (and SMS stub)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { tenantId, ticketId, event, message, title, body: notifBody, data } = body as {
        tenantId: string;
        ticketId: string;
        event: string;
        message?: string;
        title?: string;
        body?: string;
        data?: Record<string, unknown>;
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
      const VALID_EVENTS = [
        'TICKET_CALLED',
        'TICKET_COMPLETED',
        'TICKET_SKIPPED',
        'TICKET_CANCELLED',
        'QUEUE_UPDATED',
      ];
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
        .prepare(
          'SELECT id, endpoint, keys_json FROM push_subscriptions WHERE tenant_id = ? AND ticket_id = ?'
        )
        .bind(tenantId, ticketId)
        .all<{ id: string; endpoint: string; keys_json: string }>();

      // Build notification data payload
      const notifData = {
        event,
        ticketId,
        tenantId,
        ...(data || {}),
      };

      // Send Web Push notifications to each subscription
      let pushSent = 0;
      let pushFailed = 0;
      const expiredSubIds: string[] = [];

      for (const sub of subResult.results) {
        const result = await sendWebPush(sub.endpoint, sub.keys_json, {
          title,
          body: notifBody,
          data: notifData,
        });

        if (result.success) {
          pushSent++;
        } else {
          pushFailed++;
          if (result.expired) {
            expiredSubIds.push(sub.id);
          } else {
            console.warn(
              `[WebPush] Failed to send to ${sub.endpoint}: ${result.error}`
            );
          }
        }
      }

      // Clean up expired subscriptions in batch
      if (expiredSubIds.length > 0) {
        const placeholders = expiredSubIds.map(() => '?').join(', ');
        await d1
          .prepare(`DELETE FROM push_subscriptions WHERE id IN (${placeholders})`)
          .bind(...expiredSubIds)
          .run();
        console.log(
          `[WebPush] Cleaned up ${expiredSubIds.length} expired subscription(s)`
        );
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
      const ip = getClientIp(req);

      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
           VALUES (?, ?, ?, 'NOTIFICATION_SEND', ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          JSON.stringify({
            tenantId,
            ticketId,
            event,
            message,
            pushSent,
            pushFailed,
            smsPrepared,
          }),
          ip
        )
        .run();

      return NextResponse.json({ success: true, sent: pushSent, failed: pushFailed, smsPrepared });
    } catch (error) {
      console.error('Send notification error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['AGENT', 'MANAGER'] }
);