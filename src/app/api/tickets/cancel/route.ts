import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import { authenticateRequest, rateLimit } from '@/lib/auth';
import { canTransition } from '@/lib/state-machine';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';
import { emitWSEvent } from '@/lib/ws-emit';
import { dbNow } from '@/lib/datetime';
import { getClientIp, toCamel } from '@/lib/utils';

interface TicketWithQueue {
  id: string;
  tenant_id: string;
  queue_id: string;
  serial_number: number;
  status: string;
  customer_name: string;
  customer_phone: string | null;
  created_at: string;
  served_at: string | null;
  queue_name: string;
  queue_prefix: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketId, tenantId: bodyTenantId } = body as { ticketId: string; tenantId?: string };

    if (!ticketId) {
      return NextResponse.json(
        { error: 'ticketId is required' },
        { status: 400 }
      );
    }

    const d1 = await getD1FromEnv();
    const ip = getClientIp(req);

    // Check if authenticated (staff/agent mode)
    const authResult = await authenticateRequest(req);
    const isStaff = !('error' in authResult);

    let tenantId: string;
    let userId: string;
    let userType: string;

    if (isStaff) {
      const { user } = authResult;
      // Role check: only AGENT and MANAGER
      if (!['AGENT', 'MANAGER'].includes(user.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions for this action' },
          { status: 403 }
        );
      }
      if (!user.tenantId) {
        return NextResponse.json(
          { error: 'Tenant context required' },
          { status: 400 }
        );
      }
      tenantId = user.tenantId;
      userId = user.userId;
      userType = user.type;

      // Staff rate limit
      const { allowed, retryAfterMs } = await rateLimit(
        `cancel:staff:${ip}:${userId}`,
        60,
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
    } else {
      // Public mode (end user cancelling own ticket)
      if (!bodyTenantId) {
        return NextResponse.json(
          { error: 'tenantId is required in request body' },
          { status: 400 }
        );
      }
      tenantId = bodyTenantId;
      userId = 'public';
      userType = 'public';

      // Stricter rate limit for public
      const { allowed, retryAfterMs } = await rateLimit(
        `cancel:public:${ip}`,
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
    }

    // Find ticket with queue
    const ticket = await d1
      .prepare(
        `SELECT t.*, q.name as queue_name, q.prefix as queue_prefix
         FROM tickets t
         JOIN queues q ON t.queue_id = q.id
         WHERE t.id = ?`
      )
      .bind(ticketId)
      .first<TicketWithQueue>();

    if (!ticket || ticket.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    // D3: Validate cancel transition via state machine
    if (!canTransition(ticket.status, 'CANCELLED')) {
      return NextResponse.json(
        {
          error: `Cannot cancel ticket with status: ${ticket.status}. Only WAITING and SERVING tickets can be cancelled.`,
        },
        { status: 400 }
      );
    }

    const nowISO = dbNow();

    // A5: Cancel ticket with conditional WHERE to prevent double-refund race
    const cancelResult = await d1
      .prepare(
        "UPDATE tickets SET status = 'CANCELLED', cancelled_at = ? WHERE id = ? AND status IN ('WAITING', 'SERVING')"
      )
      .bind(nowISO, ticketId)
      .run();

    if (!cancelResult.meta.changes) {
      return NextResponse.json(
        {
          error: `Cannot cancel ticket with status: ${ticket.status}`,
        },
        { status: 400 }
      );
    }

    // F10: Find the UsageLedger for this ticket and refund
    const ledger = await d1
      .prepare('SELECT cost_cents FROM usage_ledgers WHERE ticket_id = ?')
      .bind(ticketId)
      .first<{ cost_cents: number }>();

    if (ledger) {
      // Refund wallet + create REFUND transaction in a batch
      await d1.batch([
        d1
          .prepare(
            "UPDATE tenants SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?"
          )
          .bind(ledger.cost_cents, tenantId),
        d1
          .prepare(
            `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by)
             VALUES (?, ?, 'REFUND', ?, ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            ledger.cost_cents,
            `Refund for cancelled ticket ${ticket.queue_prefix}${String(ticket.serial_number).padStart(3, '0')}`,
            userId
          ),
      ]);
    }

    // Audit log (skip for public users to avoid cluttering audit)
    if (isStaff) {
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          userId,
          userType,
          'TICKET_CANCEL',
          JSON.stringify({
            ticketId,
            queueId: ticket.queue_id,
            previousStatus: ticket.status,
          }),
          ip
        )
        .run();
    }

    const formattedSerial = `${ticket.queue_prefix}${String(ticket.serial_number).padStart(3, '0')}`;

    // Fire webhooks (fire-and-forget)
    dispatchWebhooks(tenantId, 'TICKET_CANCELLED', {
      ticketId,
      serialNumber: formattedSerial,
      queueName: ticket.queue_name,
      queueId: ticket.queue_id,
    });

    // Emit WebSocket event for real-time updates
    emitWSEvent(tenantId, 'TICKET_CANCELLED', {
      ticketId,
      serialNumber: formattedSerial,
      customerName: ticket.customer_name,
      queueName: ticket.queue_name,
      queueId: ticket.queue_id,
    });

    // Count remaining
    const remainingResult = await d1
      .prepare(
        'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
      )
      .bind(ticket.queue_id, 'WAITING')
      .first<{ cnt: number }>();

    const remainingWaiting = remainingResult?.cnt ?? 0;

    // Build ticket response — re-fetch to get updated status
    const updatedTicket = await d1
      .prepare('SELECT * FROM tickets WHERE id = ?')
      .bind(ticketId)
      .first<Record<string, unknown>>();

    const ticketResponse: Record<string, unknown> = {
      ...toCamel(updatedTicket!),
      formattedSerial,
      queueName: ticket.queue_name,
    };

    return NextResponse.json({
      success: true,
      ticket: ticketResponse,
      remainingWaiting,
      _event: {
        type: 'TICKET_CANCELLED',
        tenantId,
        queueId: ticket.queue_id,
        payload: {
          ticketId,
          serialNumber: formattedSerial,
          customerName: ticket.customer_name,
          queueName: ticket.queue_name,
        },
      },
    });
  } catch (error) {
    console.error('Cancel ticket error:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Cannot cancel')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
