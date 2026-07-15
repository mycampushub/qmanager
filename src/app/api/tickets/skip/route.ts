import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { canTransition } from '@/lib/state-machine';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';
import { emitWSEvent } from '@/lib/ws-emit';
import { dbNow } from '@/lib/datetime';
import { getClientIp, toCamel } from '@/lib/utils';

const TICKET_COST_CENTS = 100;

interface TicketWithQueue {
  id: string;
  tenant_id: string;
  queue_id: string;
  serial_number: number;
  status: string;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  skip_count: number;
  served_at: string | null;
  served_by_agent: string | null;
  created_at: string;
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

      // Find ticket with queue — enforce tenant isolation
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

      // Validate transition: only SERVING tickets can be skipped
      if (!canTransition(ticket.status, 'SKIPPED')) {
        return NextResponse.json(
          {
            error: `Cannot skip ticket with status: ${ticket.status}. Only SERVING tickets can be skipped.`,
          },
          { status: 400 }
        );
      }

      const nowISO = dbNow();
      const newSkipCount = ticket.skip_count + 1;
      const formattedSerial = `${ticket.queue_prefix}${String(ticket.serial_number).padStart(3, '0')}`;

      // Build batch: set SKIPPED status, clear serving fields, refund wallet
      const statements = [
        // Update ticket to SKIPPED — keep original serial_number intact
        d1
          .prepare(
            `UPDATE tickets SET status = 'SKIPPED', skip_count = ?, skipped_at = ?,
             served_by_agent = NULL, served_at = NULL
             WHERE id = ? AND status = 'SERVING'`
          )
          .bind(newSkipCount, nowISO, ticketId),

        // Remove usage ledger so skip costs nothing
        d1
          .prepare('DELETE FROM usage_ledgers WHERE ticket_id = ?')
          .bind(ticketId),

        // Refund wallet
        d1
          .prepare(
            "UPDATE tenants SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?"
          )
          .bind(TICKET_COST_CENTS, tenantId),

        // Record REFUND transaction
        d1
          .prepare(
            `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by, created_at)
             VALUES (?, ?, 'SKIP_REFUND', ?, ?, ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            TICKET_COST_CENTS,
            `Refund for skipped ticket ${formattedSerial}`,
            user.userId,
            nowISO
          ),
      ];

      const batchResult = await d1.batch(statements);

      // Verify the ticket was actually updated (race condition guard)
      if ((batchResult[0].meta?.changes ?? 0) === 0) {
        return NextResponse.json(
          { error: 'Ticket status changed concurrently. Please try again.' },
          { status: 409 }
        );
      }

      // Fire webhooks
      dispatchWebhooks(tenantId, 'TICKET_SKIPPED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: ticket.queue_name,
        queueId: ticket.queue_id,
        skipCount: newSkipCount,
      });

      // Emit WebSocket event for real-time updates
      emitWSEvent(tenantId, 'TICKET_SKIPPED', {
        ticketId,
        serialNumber: formattedSerial,
        customerName: ticket.customer_name,
        queueName: ticket.queue_name,
        queueId: ticket.queue_id,
        skipCount: newSkipCount,
      });

      // Audit log
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'TICKET_SKIP',
          JSON.stringify({
            ticketId,
            queueId: ticket.queue_id,
            skipCount: newSkipCount,
            serialNumber: ticket.serial_number,
          }),
          ip
        )
        .run();

      // Count remaining WAITING tickets (excluding SKIPPED)
      const remainingResult = await d1
        .prepare(
          'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
        )
        .bind(ticket.queue_id, 'WAITING')
        .first<{ cnt: number }>();

      // Count SKIPPED tickets available for recall
      const skippedResult = await d1
        .prepare(
          'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
        )
        .bind(ticket.queue_id, 'SKIPPED')
        .first<{ cnt: number }>();

      return NextResponse.json({
        success: true,
        ticket: {
          id: ticketId,
          tenantId: ticket.tenant_id,
          queueId: ticket.queue_id,
          status: 'SKIPPED',
          serialNumber: ticket.serial_number,
          customerName: ticket.customer_name,
          customerPhone: ticket.customer_phone,
          notes: ticket.notes,
          skipCount: newSkipCount,
          skippedAt: nowISO,
          servedByAgent: null,
          servedAt: null,
          _formattedSerial: formattedSerial,
          queueName: ticket.queue_name,
          queuePrefix: ticket.queue_prefix,
        },
        remainingWaiting: remainingResult?.cnt ?? 0,
        skippedAvailable: skippedResult?.cnt ?? 0,
        _event: {
          type: 'TICKET_SKIPPED',
          tenantId,
          queueId: ticket.queue_id,
          payload: {
            ticketId,
            serialNumber: formattedSerial,
            customerName: ticket.customer_name,
            queueName: ticket.queue_name,
            skipCount: newSkipCount,
          },
        },
      });
    } catch (error) {
      console.error('Skip ticket error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['AGENT', 'MANAGER'], requireTenantId: true }
);