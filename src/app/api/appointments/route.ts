import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

const TICKET_COST_CENTS = 100;

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─── Helpers ────────────────────────────────────────────────────

/** Parse HH:mm to minutes since midnight for comparison */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// ─── GET: List appointments ─────────────────────────────────────

// C-02: GET requires authentication — appointments contain customer PII
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const scheduledDate = req.nextUrl.searchParams.get('scheduledDate');
      const phone = req.nextUrl.searchParams.get('phone');
      const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
      const limit = Math.min(
        Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20),
        100
      );

      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
        );
      }

      // Tenant isolation: MANAGER/AGENT can only see own tenant
      if (user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant appointments' },
          { status: 403 }
        );
      }

      const where: Record<string, unknown> = { tenantId };

      if (scheduledDate) {
        if (!DATE_REGEX.test(scheduledDate)) {
          return NextResponse.json(
            { error: 'scheduledDate must be in YYYY-MM-DD format' },
            { status: 400 }
          );
        }
        where.scheduledDate = scheduledDate;
      }

      if (phone) {
        where.customerPhone = phone;
      }

      const [total, appointments] = await Promise.all([
        db.appointment.count({ where }),
        db.appointment.findMany({
          where,
          orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
          include: {
            queue: { select: { id: true, name: true, prefix: true } },
            ticket: {
              select: {
                id: true,
                serialNumber: true,
                status: true,
              },
            },
          },
        }),
      ]);

      return NextResponse.json({
        appointments: appointments.map((a) => ({
          id: a.id,
          tenantId: a.tenantId,
          queueId: a.queueId,
          queueName: a.queue.name,
          queuePrefix: a.queue.prefix,
          customerName: a.customerName,
          customerPhone: a.customerPhone,
          scheduledDate: a.scheduledDate,
          scheduledTime: a.scheduledTime,
          status: a.status,
          notes: a.notes,
          ticketId: a.ticketId,
          ticket: a.ticket
            ? {
                ...a.ticket,
                formattedSerial: `${a.queue.prefix}${String(a.ticket.serialNumber).padStart(3, '0')}`,
              }
            : null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
        total,
        page,
        limit,
      });
    } catch (error) {
      console.error('List appointments error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['AGENT', 'MANAGER', 'PLATFORM_ADMIN'] }
);

// ─── POST: Create appointment ───────────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const {
        tenantId,
        queueId,
        customerName,
        customerPhone,
        scheduledDate,
        scheduledTime,
        notes,
      } = body as {
        tenantId: string;
        queueId: string;
        customerName: string;
        customerPhone?: string;
        scheduledDate: string;
        scheduledTime: string;
        notes?: string;
      };

      const effectiveTenantId = tenantId || user.tenantId;

      if (!effectiveTenantId || !queueId || !customerName || !scheduledDate || !scheduledTime) {
        return NextResponse.json(
          { error: 'tenantId, queueId, customerName, scheduledDate, and scheduledTime are required' },
          { status: 400 }
        );
      }

      if (user.role === 'MANAGER' && user.tenantId !== effectiveTenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      if (!DATE_REGEX.test(scheduledDate)) {
        return NextResponse.json(
          { error: 'scheduledDate must be in YYYY-MM-DD format' },
          { status: 400 }
        );
      }

      if (!TIME_REGEX.test(scheduledTime)) {
        return NextResponse.json(
          { error: 'scheduledTime must be in HH:mm format' },
          { status: 400 }
        );
      }

      // H-12/H-13: Wrap queue validation, conflict check, plan limit, and creation in a single transaction
      const appointment = await db.$transaction(async (tx) => {
        // Validate queue exists and is active
        const queue = await tx.queue.findUnique({ where: { id: queueId } });
        if (!queue || !queue.isActive || queue.tenantId !== effectiveTenantId) {
          throw new Error('Queue not found, inactive, or does not belong to this tenant');
        }

        // Check time conflict inside transaction
        const newMinutes = timeToMinutes(scheduledTime);
        const existing = await tx.appointment.findMany({
          where: {
            tenantId: effectiveTenantId,
            queueId,
            scheduledDate,
            status: { in: ['SCHEDULED', 'CHECKED_IN'] },
          },
          select: { id: true, scheduledTime: true },
        });
        for (const appt of existing) {
          const existingMinutes = timeToMinutes(appt.scheduledTime);
          if (Math.abs(newMinutes - existingMinutes) < 15) {
            throw new Error('CONFLICT');
          }
        }

        // Check plan limit inside transaction
        const tenant = await tx.tenant.findUnique({ where: { id: effectiveTenantId } });
        if (tenant) {
          const planLimit = await tx.planLimit.findUnique({
            where: { planTier: tenant.planTier },
          });
          if (planLimit) {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayCount = await tx.ticket.count({
              where: {
                tenantId: effectiveTenantId,
                createdAt: { gte: todayStart },
              },
            });
            const todayApptCount = await tx.appointment.count({
              where: {
                tenantId: effectiveTenantId,
                scheduledDate: new Date().toISOString().slice(0, 10),
                status: { notIn: ['CANCELLED', 'NO_SHOW'] },
              },
            });
            if (todayCount + todayApptCount >= planLimit.maxTicketsPerDay) {
              throw new Error('LIMIT');
            }
          }
        }

        return tx.appointment.create({
          data: {
            tenantId: effectiveTenantId,
            queueId,
            customerName,
            customerPhone: customerPhone || null,
            scheduledDate,
            scheduledTime,
            notes: notes || null,
            status: 'SCHEDULED',
          },
        });
      });

      return NextResponse.json({ appointment }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (message === 'CONFLICT') {
        return NextResponse.json(
          { error: 'Time slot conflict: another appointment exists within ±15 minutes' },
          { status: 409 }
        );
      }
      if (message === 'LIMIT') {
        return NextResponse.json(
          { error: 'Daily ticket/appointment limit reached' },
          { status: 400 }
        );
      }
      if (
        message.includes('not found') ||
        message.includes('inactive') ||
        message.includes('does not belong')
      ) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      console.error('Create appointment error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'AGENT'] }
);

// ─── PUT: Update appointment status ─────────────────────────────

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { id, status } = body as {
        id: string;
        status: string;
      };

      if (!id || !status) {
        return NextResponse.json(
          { error: 'id and status are required' },
          { status: 400 }
        );
      }

      const validStatuses = ['CHECKED_IN', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }

      const appointment = await db.appointment.findUnique({
        where: { id },
        include: { queue: true },
      });

      if (!appointment) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== appointment.tenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') {
        return NextResponse.json(
          { error: 'Cannot update a cancelled or no-show appointment' },
          { status: 400 }
        );
      }

      // Handle CHECKED_IN: convert to ticket via internal call
      if (status === 'CHECKED_IN') {
        // Prevent double check-in
        if (appointment.status === 'CHECKED_IN' || appointment.ticketId) {
          return NextResponse.json(
            { error: 'Appointment already checked in' },
            { status: 409 }
          );
        }

        // Create ticket directly (mimic /api/queues/join logic)
        const result = await db.$transaction(async (tx) => {
          const tenant = await tx.tenant.findUnique({
            where: { id: appointment.tenantId },
          });
          if (!tenant || !tenant.isActive) {
            throw new Error('Tenant not found or inactive');
          }

          if (tenant.walletBalance < TICKET_COST_CENTS) {
            throw new Error('Insufficient wallet balance');
          }

          const updatedQueue = await tx.queue.update({
            where: { id: appointment.queueId },
            data: { currentSerial: { increment: 1 } },
          });

          const updatedTenant = await tx.tenant.update({
            where: { id: appointment.tenantId },
            data: { walletBalance: { decrement: TICKET_COST_CENTS } },
          });

          const ticket = await tx.ticket.create({
            data: {
              tenantId: appointment.tenantId,
              queueId: appointment.queueId,
              serialNumber: updatedQueue.currentSerial,
              status: 'WAITING',
              customerName: appointment.customerName,
              customerPhone: appointment.customerPhone,
            },
          });

          await tx.usageLedger.create({
            data: {
              tenantId: appointment.tenantId,
              ticketId: ticket.id,
              costCents: TICKET_COST_CENTS,
            },
          });

          await tx.transaction.create({
            data: {
              tenantId: appointment.tenantId,
              type: 'TICKET_CHARGE',
              amountCents: -TICKET_COST_CENTS,
              description: `Ticket from appointment ${appointment.id}`,
              createdBy: user.userId,
            },
          });

          const updatedAppt = await tx.appointment.update({
            where: { id },
            data: { status: 'CHECKED_IN', ticketId: ticket.id },
          });

          return { ticket, updatedAppt, newBalance: updatedTenant.walletBalance };
        });

        return NextResponse.json({
          appointment: {
            ...result.updatedAppt,
            ticket: {
              ...result.ticket,
              formattedSerial: `${appointment.queue.prefix}${String(result.ticket.serialNumber).padStart(3, '0')}`,
            },
          },
          newBalance: result.newBalance,
        });
      }

      // Handle CANCELLED / NO_SHOW
      if (status === 'CANCELLED' || status === 'NO_SHOW') {
        const updated = await db.appointment.update({
          where: { id },
          data: { status },
        });
        return NextResponse.json({ appointment: updated });
      }

      // Other statuses (SERVING, COMPLETED) — just update
      const updated = await db.appointment.update({
        where: { id },
        data: { status },
      });

      return NextResponse.json({ appointment: updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (
        message.includes('not found') ||
        message.includes('inactive') ||
        message.includes('Insufficient') ||
        message.includes('already checked')
      ) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      console.error('Update appointment error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'AGENT'] }
);

// ─── DELETE: Cancel appointment ─────────────────────────────────

export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const id = req.nextUrl.searchParams.get('id');
      if (!id) {
        return NextResponse.json(
          { error: 'id query param is required' },
          { status: 400 }
        );
      }

      const appointment = await db.appointment.findUnique({ where: { id } });
      if (!appointment) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== appointment.tenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') {
        return NextResponse.json(
          { error: 'Appointment already cancelled' },
          { status: 400 }
        );
      }

      const updated = await db.appointment.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      return NextResponse.json({ appointment: updated });
    } catch (error) {
      console.error('Cancel appointment error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'] }
);