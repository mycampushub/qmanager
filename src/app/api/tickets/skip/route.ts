import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { canTransition } from '@/lib/state-machine';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';

async function broadcastWS(tenantId: string, event: string, payload: Record<string, unknown>) {
  try {
    const wsUrl = process.env.WS_SERVICE_URL || 'http://localhost:3003';
    await fetch(`${wsUrl}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, event, payload }),
    });
  } catch { /* WS unavailable */ }
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

      // D2: Validate via state machine. Skip is a special re-queue: SERVING→WAITING.
      // The standard transition table doesn't include SERVING→WAITING, so we check
      // for SERVING status explicitly as the allowed skip-source.
      if (ticket.status !== 'SERVING') {
        return NextResponse.json(
          { error: `Cannot skip ticket with status: ${ticket.status}. Only SERVING tickets can be skipped.` },
          { status: 400 }
        );
      }

      // FIX A2: Proper serial update logic
      // Get the queue first, then compare
      const queue = await db.queue.findUnique({
        where: { id: ticket.queueId },
      });

      if (!queue) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      // Re-queue: set back to WAITING with higher serial number
      const now = new Date();

      // A4: Update serial and ticket in transaction — use atomic increment inside tx
      const result = await db.$transaction(async (tx) => {
        // Atomic increment inside transaction
        const updatedQueue = await tx.queue.update({
          where: { id: ticket.queueId },
          data: {
            currentSerial: { increment: 1 },
          },
        });

        const newSerial = updatedQueue.currentSerial;

        // Update ticket: skip and re-queue
        const updatedTicket = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            status: 'WAITING',
            serialNumber: newSerial,
            skipCount: { increment: 1 },
            skippedAt: now,
            servedByAgent: null,
            servedAt: null,
          },
        });

        // Update nowServingSerial
        await tx.queue.update({
          where: { id: ticket.queueId },
          data: {
            nowServingSerial: Math.max(newSerial, updatedQueue.nowServingSerial),
          },
        });

        return { updatedQueue, updatedTicket };
      });

      const formattedSerial = `${queue.prefix}${String(result.updatedTicket.serialNumber).padStart(3, '0')}`;

      // D7: Fire webhooks (fire-and-forget)
      dispatchWebhooks(tenantId, 'TICKET_SKIPPED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: queue.name,
        queueId: ticket.queueId,
        skipCount: result.updatedTicket.skipCount,
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
          action: 'TICKET_SKIP',
          details: JSON.stringify({
            ticketId,
            queueId: ticket.queueId,
            skipCount: result.updatedTicket.skipCount,
          }),
          ipAddress: ip,
        },
      });

      // Count remaining
      const remainingWaiting = await db.ticket.count({
        where: { queueId: ticket.queueId, status: 'WAITING' },
      });

      // G1: Broadcast WebSocket event
      await broadcastWS(tenantId, 'TICKET_SKIPPED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: queue.name,
        prefix: queue.prefix,
      });

      return NextResponse.json({
        success: true,
        ticket: {
          ...result.updatedTicket,
          formattedSerial,
          queueName: queue.name,
        },
        remainingWaiting,
        _event: {
          type: 'TICKET_SKIPPED',
          tenantId,
          queueId: ticket.queueId,
          payload: {
            ticketId,
            serialNumber: formattedSerial,
            customerName: ticket.customerName,
            queueName: queue.name,
            skipCount: result.updatedTicket.skipCount,
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