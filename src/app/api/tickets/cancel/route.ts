import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { canTransition } from '@/lib/state-machine';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';

// Helper: convert snake_case DB row to camelCase
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    result[camelKey] = row[key];
  }
  return result;
}

// Helper: get client IP
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

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
  // Joined queue fields
  queue_name: string;
  queue_prefix: string;
}

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { ticketId } = body as { ticketId: string };

      if (!ticketId) {
        return NextResponse.json(
          { error: 'ticketId is required' },
          { status: 400 }
        );
      }

      const tenantId = user.tenantId!;
      const d1 = await getD1FromEnv();

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

      const nowISO = new Date().toISOString();

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
              'UPDATE tenants SET wallet_balance = wallet_balance + ?, updated_at = ? WHERE id = ?'
            )
            .bind(ledger.cost_cents, nowISO, tenantId),
          d1
            .prepare(
              `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by, created_at)
               VALUES (?, ?, 'REFUND', ?, ?, ?, ?)`
            )
            .bind(
              crypto.randomUUID(),
              tenantId,
              ledger.cost_cents,
              `Refund for cancelled ticket ${ticket.queue_prefix}${String(ticket.serial_number).padStart(3, '0')}`,
              user.userId,
              nowISO
            ),
        ]);
      }

      // Audit log
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'TICKET_CANCEL',
          JSON.stringify({
            ticketId,
            queueId: ticket.queue_id,
            previousStatus: ticket.status,
          }),
          ip,
          nowISO
        )
        .run();

      const formattedSerial = `${ticket.queue_prefix}${String(ticket.serial_number).padStart(3, '0')}`;

      // Fire webhooks (fire-and-forget)
      dispatchWebhooks(tenantId, 'TICKET_CANCELLED', {
        ticketId,
        serialNumber: formattedSerial,
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
  },
  { roles: ['AGENT', 'MANAGER'], requireTenantId: true }
);