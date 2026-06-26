import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { canTransition } from '@/lib/state-machine';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';

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

      // A10: If agentId is provided, verify it belongs to same tenant
      let validatedAgentId = user.userId;
      if (agentId) {
        const agentUser = await db.staffUser.findUnique({
          where: { id: agentId },
          select: { id: true, tenantId: true, role: true, isActive: true },
        });
        if (!agentUser || agentUser.tenantId !== tenantId || !agentUser.isActive || !['AGENT', 'MANAGER'].includes(agentUser.role)) {
          return NextResponse.json(
            { error: 'Invalid agentId' },
            { status: 400 }
          );
        }
        validatedAgentId = agentId;
      }

      // Verify queue belongs to tenant
      const queue = await db.queue.findUnique({
        where: { id: queueId },
      });

      if (!queue || queue.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      // A3: Wrap the entire call-next flow in a single db.$transaction
      const result = await db.$transaction(async (tx) => {
        // Auto-complete previous SERVING ticket
        const prevServing = await tx.ticket.findFirst({
          where: { queueId, status: 'SERVING' },
        });

        if (prevServing) {
          const now = new Date();
          const durationSec = Math.round(
            (now.getTime() - (prevServing.servedAt?.getTime() || now.getTime())) /
              1000
          );

          await tx.ticket.update({
            where: { id: prevServing.id },
            data: { status: 'COMPLETED', completedAt: now },
          });

          await tx.serviceLog.create({
            data: {
              tenantId,
              queueId,
              agentId: prevServing.servedByAgent || validatedAgentId,
              ticketId: prevServing.id,
              durationSeconds: durationSec,
            },
          });

          // Update customer profile completed tickets count for auto-completed ticket
          if (prevServing.customerPhone) {
            await tx.customerProfile.update({
              where: { tenantId_phone: { tenantId, phone: prevServing.customerPhone } },
              data: { completedTickets: { increment: 1 } },
            }).catch(() => { /* profile may not exist */ });
          }
        }

        // Find next WAITING ticket
        const nextTicket = await tx.ticket.findFirst({
          where: {
            queueId,
            status: 'WAITING',
          },
          orderBy: { serialNumber: 'asc' },
        });

        if (!nextTicket) {
          return { noNext: true as const };
        }

        // D4: Validate state machine transition WAITING→SERVING
        if (!canTransition(nextTicket.status, 'SERVING')) {
          throw new Error(`Next ticket has invalid status: ${nextTicket.status}`);
        }

        // Update ticket to SERVING
        const updatedTicket = await tx.ticket.update({
          where: { id: nextTicket.id },
          data: {
            status: 'SERVING',
            servedAt: new Date(),
            servedByAgent: validatedAgentId,
          },
        });

        // Update queue nowServingSerial
        await tx.queue.update({
          where: { id: queueId },
          data: {
            nowServingSerial: Math.max(
              queue.nowServingSerial,
              updatedTicket.serialNumber
            ),
          },
        });

        return { noNext: false as const, updatedTicket };
      });

      if (result.noNext) {
        return NextResponse.json({
          calledTicket: null,
          remainingWaiting: 0,
          avgServiceTime: 0,
          ewt: 0,
          message: 'No waiting tickets in this queue',
        });
      }

      const updatedTicket = result.updatedTicket;

      // Stats for response
      const [remainingWaiting, serviceLogs] = await Promise.all([
        db.ticket.count({
          where: { queueId, status: 'WAITING' },
        }),
        db.serviceLog.findMany({
          where: {
            tenantId,
            queueId,
            durationSeconds: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { durationSeconds: true },
        }),
      ]);

      const avgServiceTime =
        serviceLogs.length > 0
          ? Math.round(
              serviceLogs.reduce(
                (sum, s) => sum + (s.durationSeconds ?? 0),
                0
              ) / serviceLogs.length
            )
          : queue.defaultServiceTimeSec;

      const ewt = remainingWaiting * avgServiceTime;

      const formattedSerial = `${queue.prefix}${String(updatedTicket.serialNumber).padStart(3, '0')}`;

      // D7: Fire webhooks (fire-and-forget)
      dispatchWebhooks(tenantId, 'TICKET_CALLED', {
        ticketId: updatedTicket.id,
        serialNumber: formattedSerial,
        customerName: updatedTicket.customerName,
        queueName: queue.name,
        queueId,
      });

      return NextResponse.json({
        calledTicket: {
          ...updatedTicket,
          formattedSerial,
          queueName: queue.name,
        },
        remainingWaiting,
        avgServiceTime,
        ewt,
        _event: {
          type: 'TICKET_CALLED',
          tenantId,
          queueId,
          payload: {
            ticketId: updatedTicket.id,
            serialNumber: formattedSerial,
            customerName: updatedTicket.customerName,
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