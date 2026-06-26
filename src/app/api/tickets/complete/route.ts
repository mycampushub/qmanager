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

      // Find ticket
      const ticket = await db.ticket.findUnique({
        where: { id: ticketId },
        include: { queue: true },
      });

      if (!ticket || ticket.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        );
      }

      // D1: Validate transition via state machine
      if (!canTransition(ticket.status, 'COMPLETED')) {
        return NextResponse.json(
          { error: `Cannot complete ticket with status: ${ticket.status}. Valid transitions from ${ticket.status} are: SERVING→COMPLETED` },
          { status: 400 }
        );
      }

      const now = new Date();
      const durationSec = ticket.servedAt
        ? Math.round((now.getTime() - ticket.servedAt.getTime()) / 1000)
        : 0;

      // Update ticket and create service log in transaction
      await db.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: 'COMPLETED', completedAt: now },
        });

        await tx.serviceLog.create({
          data: {
            tenantId,
            queueId: ticket.queueId,
            agentId: validatedAgentId || ticket.servedByAgent || user.userId,
            ticketId,
            durationSeconds: durationSec,
          },
        });

        // D8: Update customer profile completed tickets count
        if (ticket.customerPhone) {
          await tx.customerProfile.update({
            where: { tenantId_phone: { tenantId, phone: ticket.customerPhone } },
            data: { completedTickets: { increment: 1 } },
          }).catch(() => { /* profile may not exist */ });
        }
      });

      // Audit log
      const ip =
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        'unknown';

      await db.auditLog.create({
        data: {
          userId: user.userId,
          userType: user.type,
          action: 'TICKET_COMPLETE',
          details: JSON.stringify({ ticketId, queueId: ticket.queueId, durationSec }),
          ipAddress: ip,
        },
      });

      // Get remaining count
      const remainingWaiting = await db.ticket.count({
        where: { queueId: ticket.queueId, status: 'WAITING' },
      });

      const formattedSerial = `${ticket.queue.prefix}${String(ticket.serialNumber).padStart(3, '0')}`;

      // D7: Fire webhooks (fire-and-forget)
      dispatchWebhooks(tenantId, 'TICKET_COMPLETED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: ticket.queue.name,
        queueId: ticket.queueId,
        durationSec,
      });

      return NextResponse.json({
        success: true,
        ticket: {
          ...ticket,
          status: 'COMPLETED',
          completedAt: now.toISOString(),
          formattedSerial,
        },
        remainingWaiting,
        durationSec,
        _event: {
          type: 'TICKET_COMPLETED',
          tenantId,
          queueId: ticket.queueId,
          payload: {
            ticketId,
            serialNumber: formattedSerial,
            queueName: ticket.queue.name,
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