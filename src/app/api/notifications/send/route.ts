import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// Send push notification (and SMS stub)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { tenantId, ticketId, event, message, title, body: notifBody } = body as {
        tenantId: string;
        ticketId: string;
        event: string;
        message?: string;
        title?: string;
        body?: string;
      };

      // G3: Validate required fields
      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
        );
      }

      if (!title) {
        return NextResponse.json(
          { error: 'title is required' },
          { status: 400 }
        );
      }

      if (!notifBody) {
        return NextResponse.json(
          { error: 'body is required' },
          { status: 400 }
        );
      }

      // C11: Validate event against whitelist
      const VALID_EVENTS = ['TICKET_CALLED', 'TICKET_COMPLETED', 'TICKET_SKIPPED', 'TICKET_CANCELLED', 'QUEUE_UPDATED'];
      if (!ticketId || !event) {
        return NextResponse.json(
          { error: 'ticketId and event are required' },
          { status: 400 }
        );
      }
      if (!VALID_EVENTS.includes(event)) {
        return NextResponse.json(
          { error: `Invalid event type. Allowed: ${VALID_EVENTS.join(', ')}` },
          { status: 400 }
        );
      }

      // A6: Verify tenant access for ALL roles (not just MANAGER)
      if (user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only send notifications for your own tenant' },
          { status: 403 }
        );
      }

      // Find ticket — A6: also verify ticket belongs to the same tenant
      const ticket = await db.ticket.findUnique({
        where: { id: ticketId },
        select: { customerPhone: true, tenantId: true },
      });

      if (ticket && ticket.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'Ticket does not belong to this tenant' },
          { status: 403 }
        );
      }

      // Look up push subscriptions for this ticket
      const subscriptions = await db.pushSubscription.findMany({
        where: { tenantId, ticketId },
      });

      let pushSent = 0;

      for (const sub of subscriptions) {
        try {
          // Web Push notification (stub - actual implementation needs VAPID keys)
          // In production, you would use web-push library here:
          // const payload = JSON.stringify({ event, message, ticketId });
          // await webpush.sendNotification({ endpoint: sub.endpoint, keys: JSON.parse(sub.keysJson) }, payload);
          pushSent++;
        } catch {
          // If push fails, subscription might be invalid
          console.warn('Push notification failed for subscription:', sub.id);
        }
      }

      // B4: SMS stub - log for now since no Twilio API key
      let smsPrepared = false;
      if (ticket?.customerPhone && event === 'TICKET_CALLED') {
        // In production, you would call Twilio API here:
        // await twilioClient.messages.create({
        //   body: message || `Your ticket is being served now!`,
        //   from: process.env.TWILIO_PHONE,
        //   to: ticket.customerPhone,
        // });
        smsPrepared = true;
        console.log(
          `[SMS STUB] Would send to ${ticket.customerPhone}: ${message || 'Your ticket is being served now!'}`
        );
      }

      // Audit log
      const ip =
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        'unknown';

      await db.auditLog.create({
        data: {
          userId: user.userId,
          userType: user.type,
          action: 'NOTIFICATION_SEND',
          details: JSON.stringify({
            tenantId,
            ticketId,
            event,
            message,
            pushSent,
            smsPrepared,
          }),
          ipAddress: ip,
        },
      });

      return NextResponse.json({
        success: true,
        pushSent,
        smsPrepared,
      });
    } catch (error) {
      console.error('Send notification error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['AGENT', 'MANAGER'] }
);