import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { canTransition } from '@/lib/state-machine';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';
import { dbNow } from '@/lib/datetime';
import { toCamel } from '@/lib/utils';

interface TicketRow {
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
}

interface QueueRow {
  id: string;
  tenant_id: string;
  name: string;
  prefix: string;
  default_service_time_sec: number;
  now_serving_serial: number;
}

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { queueId, agentId } = body as {
        queueId: string;
        agentId?: string;
      };

      if (!queueId) {
        return NextResponse.json(
          { error: 'queueId is required' },
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

      // Verify queue belongs to tenant
      const queue = await d1
        .prepare('SELECT * FROM queues WHERE id = ?')
        .bind(queueId)
        .first<QueueRow>();

      if (!queue || queue.tenant_id !== tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      // A3: Pre-read for transaction
      // Find current SERVING ticket
      const prevServing = await d1
        .prepare(
          'SELECT * FROM tickets WHERE queue_id = ? AND status = ? LIMIT 1'
        )
        .bind(queueId, 'SERVING')
        .first<TicketRow>();

      // Find next WAITING ticket
      const nextWaiting = await d1
        .prepare(
          'SELECT * FROM tickets WHERE queue_id = ? AND status = ? ORDER BY serial_number ASC LIMIT 1'
        )
        .bind(queueId, 'WAITING')
        .first<TicketRow>();

      if (!nextWaiting) {
        return NextResponse.json({
          calledTicket: null,
          remainingWaiting: 0,
          avgServiceTime: 0,
          ewt: 0,
          message: 'No waiting tickets in this queue',
        });
      }

      // D4: Validate state machine transition WAITING→SERVING
      if (!canTransition(nextWaiting.status, 'SERVING')) {
        return NextResponse.json(
          { error: `Next ticket has invalid status: ${nextWaiting.status}` },
          { status: 400 }
        );
      }

      // Build batch statements
      const nowISO = dbNow();
      const statements: unknown[] = [];

      // Auto-complete previous SERVING ticket
      if (prevServing) {
        const durationSec = prevServing.served_at
          ? Math.round(
              (Date.now() - new Date(prevServing.served_at).getTime()) / 1000
            )
          : 0;

        statements.push(
          d1
            .prepare(
              'UPDATE tickets SET status = ?, completed_at = ? WHERE id = ? AND status = ?'
            )
            .bind('COMPLETED', nowISO, prevServing.id, 'SERVING'),
          d1
            .prepare(
              `INSERT INTO service_logs (id, tenant_id, queue_id, agent_id, ticket_id, duration_seconds)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .bind(
              crypto.randomUUID(),
              tenantId,
              queueId,
              prevServing.served_by_agent || validatedAgentId,
              prevServing.id,
              durationSec
            )
        );

        // Update customer profile completed tickets count
        if (prevServing.customer_phone) {
          statements.push(
            d1
              .prepare(
                "UPDATE customer_profiles SET completed_tickets = completed_tickets + 1, updated_at = datetime('now') WHERE tenant_id = ? AND phone = ?"
              )
              .bind(tenantId, prevServing.customer_phone)
          );
        }
      }

      // Update next ticket to SERVING
      statements.push(
        d1
          .prepare(
            'UPDATE tickets SET status = ?, served_at = ?, served_by_agent = ? WHERE id = ? AND status = ?'
          )
          .bind('SERVING', nowISO, validatedAgentId, nextWaiting.id, 'WAITING')
      );

      // Update queue nowServingSerial
      const newNowServing = Math.max(
        nextWaiting.serial_number,
        queue.now_serving_serial
      );
      statements.push(
        d1
          .prepare(
            "UPDATE queues SET now_serving_serial = ?, updated_at = datetime('now') WHERE id = ?"
          )
          .bind(newNowServing, queueId)
      );

      await d1.batch(statements as Parameters<typeof d1.batch>[0]);

      // Stats for response
      const [remainingResult, serviceLogsResult] = await Promise.all([
        d1
          .prepare(
            'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
          )
          .bind(queueId, 'WAITING')
          .first<{ cnt: number }>(),
        d1
          .prepare(
            'SELECT duration_seconds FROM service_logs WHERE tenant_id = ? AND queue_id = ? AND duration_seconds IS NOT NULL ORDER BY created_at DESC LIMIT 20'
          )
          .bind(tenantId, queueId)
          .all<{ duration_seconds: number }>(),
      ]);

      const remainingWaiting = remainingResult?.cnt ?? 0;

      const avgServiceTime =
        serviceLogsResult.results.length > 0
          ? Math.round(
              serviceLogsResult.results.reduce(
                (sum, s) => sum + (s.duration_seconds ?? 0),
                0
              ) / serviceLogsResult.results.length
            )
          : queue.default_service_time_sec;

      const ewt = remainingWaiting * avgServiceTime;

      const formattedSerial = `${queue.prefix}${String(nextWaiting.serial_number).padStart(3, '0')}`;

      // Build the updated ticket object for response
      const updatedTicket: Record<string, unknown> = {
        ...toCamel(nextWaiting as unknown as Record<string, unknown>),
        status: 'SERVING',
        servedAt: nowISO,
        servedByAgent: validatedAgentId,
        formattedSerial,
        queueName: queue.name,
      };

      // Fire webhooks (fire-and-forget)
      dispatchWebhooks(tenantId, 'TICKET_CALLED', {
        ticketId: nextWaiting.id,
        serialNumber: formattedSerial,
        customerName: nextWaiting.customer_name,
        queueName: queue.name,
        queueId,
      });

      return NextResponse.json({
        calledTicket: updatedTicket,
        remainingWaiting,
        avgServiceTime,
        ewt,
        _event: {
          type: 'TICKET_CALLED',
          tenantId,
          queueId,
          payload: {
            ticketId: nextWaiting.id,
            serialNumber: formattedSerial,
            customerName: nextWaiting.customer_name,
            queueName: queue.name,
            position: 1,
          },
        },
      });
    } catch (error) {
      console.error('Call ticket error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['AGENT', 'MANAGER'], requireTenantId: true }
);