import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import { rateLimit } from '@/lib/auth';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';
import { emitWSEvent } from '@/lib/ws-emit';
import { getClientIp } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketId, tenantId, customerPhone } = body as {
      ticketId: string;
      tenantId: string;
      customerPhone?: string;
    };

    if (!ticketId || !tenantId) {
      return NextResponse.json(
        { error: 'ticketId and tenantId are required' },
        { status: 400 }
      );
    }

    const d1 = await getD1FromEnv();
    const ip = getClientIp(req);

    // Rate limit
    const { allowed, retryAfterMs } = await rateLimit(
      `cancelBooking:${ip}`,
      10,
      60_000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    // Find ticket with queue info
    const ticket = await d1
      .prepare(
        `SELECT t.*, q.name as queue_name, q.prefix as queue_prefix
         FROM tickets t
         JOIN queues q ON t.queue_id = q.id
         WHERE t.id = ? AND t.tenant_id = ?`
      )
      .bind(ticketId, tenantId)
      .first<{
        id: string;
        tenant_id: string;
        queue_id: string;
        serial_number: number;
        status: string;
        customer_phone: string | null;
        source: string;
        queue_name: string;
        queue_prefix: string;
      }>();

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // Verify ownership if phone provided
    if (customerPhone && ticket.customer_phone !== customerPhone) {
      return NextResponse.json(
        { error: 'Phone number does not match' },
        { status: 403 }
      );
    }

    // Can only cancel WAITING tickets
    if (ticket.status !== 'WAITING') {
      return NextResponse.json(
        { error: `Cannot cancel ticket with status: ${ticket.status}. Only waiting tickets can be cancelled.` },
        { status: 400 }
      );
    }

    // Atomic cancel: update ticket + appointment in batch
    const nowISO = new Date().toISOString();
    const formattedSerial = `${ticket.queue_prefix}${String(ticket.serial_number).padStart(3, '0')}`;

    await d1.batch([
      // Cancel ticket
      d1
        .prepare(
          "UPDATE tickets SET status = 'CANCELLED', cancelled_at = ? WHERE id = ? AND status = 'WAITING'"
        )
        .bind(nowISO, ticketId),

      // Cancel linked appointment if exists
      d1
        .prepare(
          "UPDATE appointments SET status = 'CANCELLED', updated_at = ? WHERE ticket_id = ? AND status = 'CONFIRMED'"
        )
        .bind(nowISO, ticketId),
    ]);

    // Refund wallet + create refund transaction
    const ledger = await d1
      .prepare('SELECT cost_cents FROM usage_ledgers WHERE ticket_id = ?')
      .bind(ticketId)
      .first<{ cost_cents: number }>();

    if (ledger) {
      await d1.batch([
        d1
          .prepare(
            "UPDATE tenants SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?"
          )
          .bind(ledger.cost_cents, tenantId),
        d1
          .prepare(
            `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_at)
             VALUES (?, ?, 'REFUND', ?, ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            ledger.cost_cents,
            `Refund for cancelled booking ${formattedSerial}`,
            'public'
          ),
      ]);
    }

    // Fire webhooks
    dispatchWebhooks(tenantId, 'TICKET_CANCELLED', {
      ticketId,
      serialNumber: formattedSerial,
      queueName: ticket.queue_name,
      queueId: ticket.queue_id,
      source: ticket.source,
    });

    // Emit WebSocket event
    emitWSEvent(tenantId, 'TICKET_CANCELLED', {
      ticketId,
      serialNumber: formattedSerial,
      customerName: '',
      queueName: ticket.queue_name,
      queueId: ticket.queue_id,
    });

    return NextResponse.json({
      success: true,
      message: 'Your booking has been cancelled successfully.',
      ticket: {
        id: ticketId,
        status: 'CANCELLED',
        formattedSerial,
      },
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}