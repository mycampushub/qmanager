import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { canTransition } from '@/lib/state-machine';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';
import { dbNow } from '@/lib/datetime';
import { getClientIp, toCamel } from '@/lib/utils';

const TICKET_COST_CENTS = 100;

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { queueId, serialNumber, ticketId } = body as {
        queueId?: string;
        serialNumber?: number;
        ticketId?: string;
      };

      // Need either ticketId or (queueId + serialNumber) to identify the ticket
      if (!ticketId && !(queueId && serialNumber)) {
        return NextResponse.json(
          { error: 'Provide ticketId or (queueId + serialNumber)' },
          { status: 400 }
        );
      }

      const tenantId = user.tenantId!;
      const d1 = await getD1FromEnv();

      // Build the query to find the skipped ticket
      let ticket: {
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
        queue_name: string;
        queue_prefix: string;
        queue_default_service_time_sec: number;
      } | null = null;

      if (ticketId) {
        ticket = await d1
          .prepare(
            `SELECT t.*, q.name as queue_name, q.prefix as queue_prefix,
                    q.default_service_time_sec as queue_default_service_time_sec
             FROM tickets t
             JOIN queues q ON t.queue_id = q.id
             WHERE t.id = ?`
          )
          .bind(ticketId)
          .first();
      } else {
        ticket = await d1
          .prepare(
            `SELECT t.*, q.name as queue_name, q.prefix as queue_prefix,
                    q.default_service_time_sec as queue_default_service_time_sec
             FROM tickets t
             JOIN queues q ON t.queue_id = q.id
             WHERE t.queue_id = ? AND t.serial_number = ? AND t.tenant_id = ?`
          )
          .bind(queueId, serialNumber, tenantId)
          .first();
      }

      if (!ticket || ticket.tenant_id !== tenantId) {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        );
      }

      if (ticket.status !== 'SKIPPED') {
        return NextResponse.json(
          { error: `Cannot recall ticket with status: ${ticket.status}. Only SKIPPED tickets can be recalled.` },
          { status: 400 }
        );
      }

      if (!canTransition('SKIPPED', 'SERVING')) {
        return NextResponse.json(
          { error: 'Invalid state transition' },
          { status: 400 }
        );
      }

      // Check wallet balance before recalling (re-charge)
      const tenant = await d1
        .prepare('SELECT wallet_balance FROM tenants WHERE id = ?')
        .bind(tenantId)
        .first<{ wallet_balance: number }>();

      if (!tenant || tenant.wallet_balance < TICKET_COST_CENTS) {
        return NextResponse.json(
          { error: 'Insufficient wallet balance to recall ticket' },
          { status: 400 }
        );
      }

      const nowISO = dbNow();
      const formattedSerial = `${ticket.queue_prefix}${String(ticket.serial_number).padStart(3, '0')}`;

      // Check if there's already a SERVING ticket in this queue
      const currentServing = await d1
        .prepare('SELECT id, served_at FROM tickets WHERE queue_id = ? AND status = ? LIMIT 1')
        .bind(ticket.queue_id, 'SERVING')
        .first<{ id: string; served_at: string }>();

      // Auto-complete current SERVING ticket if exists
      const statements: unknown[] = [];

      if (currentServing) {
        const durationSec = currentServing.served_at
          ? Math.round((Date.now() - new Date(currentServing.served_at).getTime()) / 1000)
          : 0;

        statements.push(
          d1.prepare(
            'UPDATE tickets SET status = ?, completed_at = ? WHERE id = ? AND status = ?'
          ).bind('COMPLETED', nowISO, currentServing.id, 'SERVING'),
          d1.prepare(
            `INSERT INTO service_logs (id, tenant_id, queue_id, agent_id, ticket_id, duration_seconds, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            tenantId,
            ticket.queue_id,
            user.userId,
            currentServing.id,
            durationSec,
            nowISO
          )
        );
      }

      // Recall: set SERVING, charge wallet, create usage ledger
      statements.push(
        d1.prepare(
          `UPDATE tickets SET status = 'SERVING', served_at = ?, served_by_agent = ?
           WHERE id = ? AND status = 'SKIPPED'`
        ).bind(nowISO, user.userId, ticket.id),

        // Re-charge wallet for the recalled ticket
        d1.prepare(
          "UPDATE tenants SET wallet_balance = wallet_balance - ?, updated_at = datetime('now') WHERE id = ? AND wallet_balance >= ?"
        ).bind(TICKET_COST_CENTS, tenantId, TICKET_COST_CENTS),

        // Create usage ledger for the recalled ticket
        d1.prepare(
          `INSERT OR IGNORE INTO usage_ledgers (id, tenant_id, ticket_id, cost_cents, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), tenantId, ticket.id, TICKET_COST_CENTS, nowISO),

        // Transaction record
        d1.prepare(
          `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by, created_at)
           VALUES (?, ?, 'TICKET_RECALL_CHARGE', ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          tenantId,
          -TICKET_COST_CENTS,
          `Recall charge for ticket ${formattedSerial}`,
          user.userId,
          nowISO
        ),

        // Update queue now_serving_serial
        d1.prepare(
          `UPDATE queues SET now_serving_serial = MAX(now_serving_serial, ?), updated_at = datetime('now') WHERE id = ?`
        ).bind(ticket.serial_number, ticket.queue_id)
      );

      const batchResult = await d1.batch(statements as Parameters<typeof d1.batch>[0]);

      // Check if the recall UPDATE actually changed a row
      // The recall UPDATE is at index = 0 or 2 depending on whether auto-complete happened
      const recallIdx = currentServing ? 2 : 0;
      if ((batchResult[recallIdx].meta?.changes ?? 0) === 0) {
        return NextResponse.json(
          { error: 'Ticket status changed concurrently. Please try again.' },
          { status: 409 }
        );
      }

      // Get remaining counts
      const [waitingResult, skippedResult] = await Promise.all([
        d1.prepare('SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?').bind(ticket.queue_id, 'WAITING').first<{ cnt: number }>(),
        d1.prepare('SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?').bind(ticket.queue_id, 'SKIPPED').first<{ cnt: number }>(),
      ]);

      const remainingWaiting = waitingResult?.cnt ?? 0;
      const skippedAvailable = skippedResult?.cnt ?? 0;

      // Fire webhooks
      dispatchWebhooks(tenantId, 'TICKET_RECALLED', {
        ticketId: ticket.id,
        serialNumber: formattedSerial,
        customerName: ticket.customer_name,
        queueName: ticket.queue_name,
        queueId: ticket.queue_id,
      });

      // Audit log
      const ip = getClientIp(req);
      await d1.prepare(
        `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        user.userId,
        user.type,
        'TICKET_RECALL',
        JSON.stringify({
          ticketId: ticket.id,
          queueId: ticket.queue_id,
          serialNumber: ticket.serial_number,
          skipCount: ticket.skip_count,
        }),
        ip
      ).run();

      return NextResponse.json({
        success: true,
        ticket: {
          id: ticket.id,
          tenantId,
          queueId: ticket.queue_id,
          serialNumber: ticket.serial_number,
          status: 'SERVING',
          customerName: ticket.customer_name,
          customerPhone: ticket.customer_phone,
          servedAt: nowISO,
          servedByAgent: user.userId,
          skipCount: ticket.skip_count,
          _formattedSerial: formattedSerial,
          _peopleAhead: 0,
          _ewt: 0,
          queueName: ticket.queue_name,
          queuePrefix: ticket.queue_prefix,
        },
        remainingWaiting,
        skippedAvailable,
        _event: {
          type: 'TICKET_RECALLED',
          tenantId,
          queueId: ticket.queue_id,
          payload: {
            ticketId: ticket.id,
            serialNumber: formattedSerial,
            customerName: ticket.customer_name,
            queueName: ticket.queue_name,
          },
        },
      });
    } catch (error) {
      console.error('Recall ticket error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['AGENT', 'MANAGER'], requireTenantId: true }
);