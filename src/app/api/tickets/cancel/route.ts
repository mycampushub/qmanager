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

      // D3: Validate cancel transition via state machine for clear error messages
      if (!canTransition(ticket.status, 'CANCELLED')) {
        return NextResponse.json(
          { error: `Cannot cancel ticket with status: ${ticket.status}. Only WAITING and SERVING tickets can be cancelled.` },
          { status: 400 }
        );
      }

      // A5: Move status check inside the transaction with conditional WHERE to prevent double-refund race
      const now = new Date();
      const updatedTicket = await db.$transaction(async (tx) => {
        // Conditional update: only update if status is WAITING or SERVING
        const updated = await tx.ticket.updateMany({
          where: {
            id: ticketId,
            status: { in: ['WAITING', 'SERVING'] },
          },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
          },
        });

        if (updated.count === 0) {
          throw new Error(`Cannot cancel ticket with status: ${ticket.status}`);
        }

        // Re-fetch the updated ticket for response
        const ticketRecord = await tx.ticket.findUnique({
          where: { id: ticketId },
        });

        // F10: Find the UsageLedger for this ticket and refund
        const ledger = await tx.usageLedger.findUnique({
          where: { ticketId },
        });

        if (ledger) {
          // Refund wallet
          await tx.tenant.update({
            where: { id: tenantId },
            data: { walletBalance: { increment: ledger.costCents } },
          });

          // Create REFUND Transaction record
          await tx.transaction.create({
            data: {
              tenantId,
              type: 'REFUND',
              amountCents: ledger.costCents,
              description: `Refund for cancelled ticket ${ticket.queue.prefix}${String(ticket.serialNumber).padStart(3, '0')}`,
              createdBy: user.userId,
            },
          });
        }

        return ticketRecord;
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
          action: 'TICKET_CANCEL',
          details: JSON.stringify({
            ticketId,
            queueId: ticket.queueId,
            previousStatus: ticket.status,
          }),
          ipAddress: ip,
        },
      });

      const formattedSerial = `${ticket.queue.prefix}${String(ticket.serialNumber).padStart(3, '0')}`;

      // D7: Fire webhooks (fire-and-forget)
      dispatchWebhooks(tenantId, 'TICKET_CANCELLED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: ticket.queue.name,
        queueId: ticket.queueId,
      });

      // Count remaining
      const remainingWaiting = await db.ticket.count({
        where: { queueId: ticket.queueId, status: 'WAITING' },
      });

      // G1: Broadcast WebSocket event
      await broadcastWS(tenantId, 'TICKET_CANCELLED', {
        ticketId,
        serialNumber: formattedSerial,
        queueName: ticket.queue.name,
        prefix: ticket.queue.prefix,
      });

      return NextResponse.json({
        success: true,
        ticket: {
          ...updatedTicket,
          formattedSerial,
          queueName: ticket.queue.name,
        },
        remainingWaiting,
        _event: {
          type: 'TICKET_CANCELLED',
          tenantId,
          queueId: ticket.queueId,
          payload: {
            ticketId,
            serialNumber: formattedSerial,
            customerName: ticket.customerName,
            queueName: ticket.queue.name,
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