import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
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
  device_id: string | null;
  notes: string | null;
  served_by_agent: string | null;
  skip_count: number;
  created_at: string;
  served_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  skipped_at: string | null;
  // Joined queue fields
  queue_name: string;
  queue_prefix: string;
  queue_default_service_time_sec: number;
}

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { ticketId, agentId } = body as {
        ticketId: string;
        agentId?: string;
      };

      if (!ticketId) {
        return NextResponse.json(
          { error: 'ticketId is required' },
          { status: 400 }
        );
      }

      const tenantId = user.tenantId!;
      const d1 = await getD1FromEnv();

      // A10: If agentId is provided, verify it belongs to same tenant
      let validatedAgentId = user.userId;
      if (agentId) {
        const agentUser = await d1
          .prepare(
            'SELECT id, tenant_id, role, is_active FROM users WHERE id = ?'
          )
          .bind(agentId)
          .first<{
            id: string;
            tenant_id: string;
            role: string;
            is_active: number;
          }>();
        if (
          !agentUser ||
          agentUser.tenant_id !== tenantId ||
          agentUser.is_active !== 1 ||
          !['AGENT', 'MANAGER'].includes(agentUser.role)
        ) {
          return NextResponse.json(
            { error: 'Invalid agentId' },
            { status: 400 }
          );
        }
        validatedAgentId = agentId;
      }

      // Find ticket with queue
      const ticket = await d1
        .prepare(
          `SELECT t.*, q.name as queue_name, q.prefix as queue_prefix, q.default_service_time_sec as queue_default_service_time_sec
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

      // D1: Validate transition via state machine
      if (!canTransition(ticket.status, 'COMPLETED')) {
        return NextResponse.json(
          {
            error: `Cannot complete ticket with status: ${ticket.status}. Valid transitions from ${ticket.status} are: SERVING→COMPLETED`,
          },
          { status: 400 }
        );
      }

      const nowISO = dbNow();
      const durationSec = ticket.served_at
        ? Math.round(
            (Date.now() - new Date(ticket.served_at).getTime()) / 1000
          )
        : 0;

      // C3: Update ticket with status guard to prevent race conditions
      const completeResult = await d1
        .prepare("UPDATE tickets SET status = ?, completed_at = ? WHERE id = ? AND status = 'SERVING'")
        .bind('COMPLETED', nowISO, ticketId)
        .run();

      if (!completeResult.meta.changes) {
        return NextResponse.json(
          { error: `Cannot complete ticket with status: ${ticket.status}. Only SERVING tickets can be completed.` },
          { status: 400 }
        );
      }

      // Transaction: create service log, update customer profile
      const statements = [
        d1
          .prepare(
            `INSERT INTO service_logs (id, tenant_id, queue_id, agent_id, ticket_id, duration_seconds)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            tenantId,
            ticket.queue_id,
            validatedAgentId || ticket.served_by_agent || user.userId,
            ticketId,
            durationSec
          ),
      ];

      // D8: Update customer profile completed tickets count
      if (ticket.customer_phone) {
        statements.push(
          d1
            .prepare(
              "UPDATE customer_profiles SET completed_tickets = completed_tickets + 1, updated_at = datetime('now') WHERE tenant_id = ? AND phone = ?"
            )
            .bind(tenantId, ticket.customer_phone)
        );
      }

      await d1.batch(statements);

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
          'TICKET_COMPLETE',
          JSON.stringify({
            ticketId,
            queueId: ticket.queue_id,
            durationSec,
          }),
          ip
        )
        .run();

      // Get remaining count
      const remainingResult = await d1
        .prepare(
          'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
        )
        .bind(ticket.queue_id, 'WAITING')
        .first<{ cnt: number }>();

      const remainingWaiting = remainingResult?.cnt ?? 0;

      const formattedSerial = `${ticket.queue_prefix}${String(ticket.serial_number).padStart(3, '0')}`;

      // Build ticket response
      const ticketResponse: Record<string, unknown> = {
        ...toCamel(ticket as unknown as Record<string, unknown>),
        status: 'COMPLETED',
        completedAt: nowISO,
        formattedSerial,
      };

      // Fire webhooks (fire-and-forget)
      dispatchWebhooks(tenantId, 'TICKET_COMPLETED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: ticket.queue_name,
        queueId: ticket.queue_id,
        durationSec,
      });

      // Emit WebSocket event for real-time updates
      emitWSEvent(tenantId, 'TICKET_COMPLETED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: ticket.queue_name,
        queueId: ticket.queue_id,
        durationSec,
      });

      return NextResponse.json({
        success: true,
        ticket: ticketResponse,
        remainingWaiting,
        durationSec,
        _event: {
          type: 'TICKET_COMPLETED',
          tenantId,
          queueId: ticket.queue_id,
          payload: {
            ticketId,
            serialNumber: formattedSerial,
            queueName: ticket.queue_name,
            durationSec,
          },
        },
      });
    } catch (error) {
      console.error('Complete ticket error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['AGENT', 'MANAGER'], requireTenantId: true }
);