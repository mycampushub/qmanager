import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
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
  skip_count: number;
  served_at: string | null;
  served_by_agent: string | null;
  created_at: string;
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

      // D2: Only SERVING tickets can be skipped
      if (ticket.status !== 'SERVING') {
        return NextResponse.json(
          {
            error: `Cannot skip ticket with status: ${ticket.status}. Only SERVING tickets can be skipped.`,
          },
          { status: 400 }
        );
      }

      // Get queue for current serial and now_serving_serial
      const queue = await d1
        .prepare('SELECT current_serial, now_serving_serial FROM queues WHERE id = ?')
        .bind(ticket.queue_id)
        .first<{ current_serial: number; now_serving_serial: number }>();

      if (!queue) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      const newSerial = queue.current_serial + 1;
      const newNowServing = Math.max(newSerial, queue.now_serving_serial);
      const nowISO = new Date().toISOString();

      // A4: Update serial and ticket in transaction
      await d1.batch([
        // Atomic increment queue serial
        d1
          .prepare(
            'UPDATE queues SET current_serial = ?, updated_at = ? WHERE id = ?'
          )
          .bind(newSerial, nowISO, ticket.queue_id),

        // Update ticket: skip and re-queue
        d1
          .prepare(
            `UPDATE tickets SET status = 'WAITING', serial_number = ?, skip_count = skip_count + 1, skipped_at = ?, served_by_agent = NULL, served_at = NULL WHERE id = ?`
          )
          .bind(newSerial, nowISO, ticketId),

        // Update nowServingSerial
        d1
          .prepare(
            'UPDATE queues SET now_serving_serial = ?, updated_at = ? WHERE id = ?'
          )
          .bind(newNowServing, nowISO, ticket.queue_id),
      ]);

      const formattedSerial = `${ticket.queue_prefix}${String(newSerial).padStart(3, '0')}`;
      const newSkipCount = ticket.skip_count + 1;

      // Fire webhooks (fire-and-forget)
      dispatchWebhooks(tenantId, 'TICKET_SKIPPED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: ticket.queue_name,
        queueId: ticket.queue_id,
        skipCount: newSkipCount,
      });

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
          'TICKET_SKIP',
          JSON.stringify({
            ticketId,
            queueId: ticket.queue_id,
            skipCount: newSkipCount,
          }),
          ip,
          nowISO
        )
        .run();

      // Count remaining
      const remainingResult = await d1
        .prepare(
          'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
        )
        .bind(ticket.queue_id, 'WAITING')
        .first<{ cnt: number }>();

      const remainingWaiting = remainingResult?.cnt ?? 0;

      // Build ticket response
      const ticketResponse: Record<string, unknown> = {
        ...toCamel(ticket as unknown as Record<string, unknown>),
        status: 'WAITING',
        serialNumber: newSerial,
        skipCount: newSkipCount,
        skippedAt: nowISO,
        servedByAgent: null,
        servedAt: null,
        formattedSerial,
        queueName: ticket.queue_name,
      };

      return NextResponse.json({
        success: true,
        ticket: ticketResponse,
        remainingWaiting,
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
            newPosition: remainingWaiting,
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