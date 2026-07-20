import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { dbNow } from '@/lib/datetime';

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

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const scheduledDate = req.nextUrl.searchParams.get('scheduledDate');
      const phone = req.nextUrl.searchParams.get('phone');
      const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1);
      const limit = Math.min(
        Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '20', 10) || 20),
        100
      );

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      // Tenant isolation
      if (user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant appointments' },
          { status: 403 }
        );
      }

      // Build WHERE clause
      const whereClauses: string[] = ['a.tenant_id = ?'];
      const binds: unknown[] = [tenantId];

      if (scheduledDate) {
        if (!DATE_REGEX.test(scheduledDate)) {
          return NextResponse.json(
            { error: 'scheduledDate must be in YYYY-MM-DD format' },
            { status: 400 }
          );
        }
        whereClauses.push('a.scheduled_date = ?');
        binds.push(scheduledDate);
      }

      if (phone) {
        whereClauses.push('a.customer_phone = ?');
        binds.push(phone);
      }

      const whereSQL = whereClauses.join(' AND ');

      const [countResult, listResult] = await d1.batch([
        d1.prepare(`SELECT count(*) as cnt FROM appointments a WHERE ${whereSQL}`).bind(...binds),
        d1.prepare(
          `SELECT a.id, a.tenant_id, a.queue_id, a.customer_name, a.customer_phone,
                  a.scheduled_date, a.scheduled_time, a.status, a.notes, a.ticket_id, a.source,
                  a.created_at, a.updated_at,
                  q.name as queue_name, q.prefix as queue_prefix,
                  t.id as ticket_id_col, t.serial_number as ticket_serial, t.status as ticket_status
           FROM appointments a
           JOIN queues q ON a.queue_id = q.id
           LEFT JOIN tickets t ON a.ticket_id = t.id
           WHERE ${whereSQL}
           ORDER BY a.scheduled_date ASC, a.scheduled_time ASC
           LIMIT ? OFFSET ?`
        ).bind(...binds, limit, (page - 1) * limit),
      ]);

      const total = ((countResult.results as { cnt: number }[])[0]?.cnt) ?? 0;

      type ApptRow = {
        id: string; tenant_id: string; queue_id: string; customer_name: string; customer_phone: string | null;
        scheduled_date: string; scheduled_time: string; status: string; notes: string | null; ticket_id: string | null;
        source: string | null;
        created_at: string; updated_at: string;
        queue_name: string; queue_prefix: string;
        ticket_id_col: string | null; ticket_serial: number | null; ticket_status: string | null;
      };

      const appointments = (listResult.results as ApptRow[]).map((a) => ({
        id: a.id,
        tenantId: a.tenant_id,
        queueId: a.queue_id,
        queueName: a.queue_name,
        queuePrefix: a.queue_prefix,
        customerName: a.customer_name,
        customerPhone: a.customer_phone,
        scheduledDate: a.scheduled_date,
        scheduledTime: a.scheduled_time,
        status: a.status,
        source: a.source || 'STAFF',
        notes: a.notes,
        ticketId: a.ticket_id,
        ticket: a.ticket_id_col
          ? {
              id: a.ticket_id_col,
              serialNumber: a.ticket_serial,
              status: a.ticket_status,
              formattedSerial: `${a.queue_prefix}${String(a.ticket_serial ?? 0).padStart(3, '0')}`,
            }
          : null,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      }));

      return NextResponse.json({ appointments, total, page, limit });
    } catch (error) {
      console.error('List appointments error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['AGENT', 'MANAGER', 'PLATFORM_ADMIN'] }
);

// ─── POST: Create appointment ───────────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
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

      // Validate queue exists and is active
      const queue = await d1
        .prepare('SELECT id, tenant_id, is_active FROM queues WHERE id = ?')
        .bind(queueId)
        .first<{ id: string; tenant_id: string; is_active: number }>();

      if (!queue || queue.is_active !== 1 || queue.tenant_id !== effectiveTenantId) {
        return NextResponse.json(
          { error: 'Queue not found, inactive, or does not belong to this tenant' },
          { status: 400 }
        );
      }

      // Check time conflict
      const newMinutes = timeToMinutes(scheduledTime);
      const existingAppts = await d1
        .prepare(
          `SELECT id, scheduled_time FROM appointments
           WHERE tenant_id = ? AND queue_id = ? AND scheduled_date = ? AND status IN ('SCHEDULED', 'CHECKED_IN')`
        )
        .bind(effectiveTenantId, queueId, scheduledDate)
        .all<{ id: string; scheduled_time: string }>();

      for (const appt of existingAppts.results) {
        const existingMinutes = timeToMinutes(appt.scheduled_time);
        if (Math.abs(newMinutes - existingMinutes) < 15) {
          return NextResponse.json(
            { error: 'Time slot conflict: another appointment exists within ±15 minutes' },
            { status: 409 }
          );
        }
      }

      // Check plan limit
      const tenantRow = await d1
        .prepare(
          `SELECT pl.max_tickets_per_day as max_tpd
           FROM tenants t JOIN plan_limits pl ON t.plan_tier = pl.plan_tier
           WHERE t.id = ?`
        )
        .bind(effectiveTenantId)
        .first<{ max_tpd: number }>();

      if (tenantRow) {
        const todayStr = dbNow().slice(0, 10);

        const [ticketCount, apptCount] = await d1.batch([
          d1.prepare("SELECT count(*) as cnt FROM tickets WHERE tenant_id = ? AND created_at >= datetime('now', 'start of day')").bind(effectiveTenantId),
          d1.prepare("SELECT count(*) as cnt FROM appointments WHERE tenant_id = ? AND scheduled_date = ? AND status NOT IN ('CANCELLED', 'NO_SHOW')").bind(effectiveTenantId, todayStr),
        ]);

        const todayTickets = ((ticketCount.results as { cnt: number }[])[0]?.cnt) ?? 0;
        const todayAppts = ((apptCount.results as { cnt: number }[])[0]?.cnt) ?? 0;

        if (todayTickets + todayAppts >= tenantRow.max_tpd) {
          return NextResponse.json(
            { error: 'Daily ticket/appointment limit reached' },
            { status: 400 }
          );
        }
      }

      // Create appointment
      const newId = crypto.randomUUID();

      await d1.prepare(
        `INSERT INTO appointments (id, tenant_id, queue_id, customer_name, customer_phone, scheduled_date, scheduled_time, notes, status, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', 'STAFF')`
      ).bind(newId, effectiveTenantId, queueId, customerName, customerPhone || null, scheduledDate, scheduledTime, notes || null).run();

      const appointment = {
        id: newId,
        tenantId: effectiveTenantId,
        queueId,
        customerName,
        customerPhone: customerPhone || null,
        scheduledDate,
        scheduledTime,
        status: 'SCHEDULED',
        notes: notes || null,
        ticketId: null,
        createdAt: dbNow(),
        updatedAt: dbNow(),
      };

      return NextResponse.json({ appointment }, { status: 201 });
    } catch (error) {
      console.error('Create appointment error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'AGENT'] }
);

// ─── PUT: Update appointment status ─────────────────────────────

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { id, status } = body as {
        id: string;
        status: string;
      };

      if (!id || !status) {
        return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
      }

      const validStatuses = ['CHECKED_IN', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }

      // Fetch appointment with queue info
      const appointment = await d1.prepare(
        `SELECT a.id, a.tenant_id, a.queue_id, a.customer_name, a.customer_phone, a.status, a.ticket_id,
                q.prefix
         FROM appointments a
         JOIN queues q ON a.queue_id = q.id
         WHERE a.id = ?`
      ).bind(id).first<{
        id: string; tenant_id: string; queue_id: string; customer_name: string; customer_phone: string | null;
        status: string; ticket_id: string | null; prefix: string;
      }>();

      if (!appointment) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== appointment.tenant_id) {
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

      // Handle CHECKED_IN: convert to ticket
      if (status === 'CHECKED_IN') {
        if (appointment.status === 'CHECKED_IN' || appointment.ticket_id) {
          return NextResponse.json(
            { error: 'Appointment already checked in' },
            { status: 409 }
          );
        }

        const now = dbNow();
        const ticketId = crypto.randomUUID();
        const ledgerId = crypto.randomUUID();
        const txnId = crypto.randomUUID();

        // Transaction: check wallet, increment serial atomically, create ticket, create ledger, create transaction, update appointment
        const tenantResult = await d1
          .prepare('SELECT id, is_active, wallet_balance FROM tenants WHERE id = ?')
          .bind(appointment.tenant_id)
          .first<{ id: string; is_active: number; wallet_balance: number }>();

        if (!tenantResult || tenantResult.is_active !== 1) {
          return NextResponse.json({ error: 'Tenant not found or inactive' }, { status: 400 });
        }
        if (tenantResult.wallet_balance < TICKET_COST_CENTS) {
          return NextResponse.json({ error: 'Insufficient wallet balance' }, { status: 400 });
        }

        // Execute all writes in a batch (D1 transaction)
        // M8 FIX: Atomic serial increment via SQL, then subquery to read the new value
        await d1.batch([
          d1.prepare("UPDATE queues SET current_serial = current_serial + 1, updated_at = datetime('now') WHERE id = ?").bind(appointment.queue_id),
          d1.prepare("UPDATE tenants SET wallet_balance = wallet_balance - ?, updated_at = datetime('now') WHERE id = ? AND wallet_balance >= ?").bind(TICKET_COST_CENTS, appointment.tenant_id, TICKET_COST_CENTS),
          d1.prepare(
            `INSERT INTO tickets (id, tenant_id, queue_id, serial_number, status, customer_name, customer_phone, created_at)
             VALUES (?, ?, ?, (SELECT current_serial FROM queues WHERE id = ?), 'WAITING', ?, ?, ?)`
          ).bind(ticketId, appointment.tenant_id, appointment.queue_id, appointment.queue_id, appointment.customer_name, appointment.customer_phone, now),
          d1.prepare(
            `INSERT INTO usage_ledgers (id, tenant_id, ticket_id, cost_cents, created_at) VALUES (?, ?, ?, ?, ?)`
          ).bind(ledgerId, appointment.tenant_id, ticketId, TICKET_COST_CENTS, now),
          d1.prepare(
            `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_by)
             VALUES (?, ?, 'TICKET_CHARGE', ?, ?, ?)`
          ).bind(txnId, appointment.tenant_id, -TICKET_COST_CENTS, `Ticket from appointment ${appointment.id}`, user.userId),
          d1.prepare(
            "UPDATE appointments SET status = 'CHECKED_IN', ticket_id = ?, updated_at = datetime('now') WHERE id = ?"
          ).bind(ticketId, id),
        ]);

        // Read the new serial post-batch
        const updatedQueue = await d1
          .prepare('SELECT current_serial, prefix FROM queues WHERE id = ?')
          .bind(appointment.queue_id)
          .first<{ current_serial: number; prefix: string }>();
        const newSerial = updatedQueue?.current_serial ?? 0;
        const newBalance = tenantResult.wallet_balance - TICKET_COST_CENTS;

        return NextResponse.json({
          appointment: {
            id,
            tenantId: appointment.tenant_id,
            queueId: appointment.queue_id,
            customerName: appointment.customer_name,
            customerPhone: appointment.customer_phone,
            scheduledDate: '',  // not needed in check-in response but keeping shape
            scheduledTime: '',
            status: 'CHECKED_IN',
            notes: null,
            ticketId,
            ticket: {
              id: ticketId,
              tenantId: appointment.tenant_id,
              queueId: appointment.queue_id,
              serialNumber: newSerial,
              status: 'WAITING',
              customerName: appointment.customer_name,
              customerPhone: appointment.customer_phone,
              formattedSerial: `${updatedQueue?.prefix || appointment.prefix}${String(newSerial).padStart(3, '0')}`,
            },
            createdAt: now,
            updatedAt: now,
          },
          newBalance,
        });
      }

      // Handle CANCELLED / NO_SHOW / SERVING / COMPLETED — simple update
      await d1
        .prepare("UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(status, id)
        .run();

      // Fetch updated
      const updated = await d1
        .prepare('SELECT * FROM appointments WHERE id = ?')
        .bind(id)
        .first<Record<string, unknown>>();

      return NextResponse.json({ appointment: updated });
    } catch (error: unknown) {
      console.error('Update appointment error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'AGENT'] }
);

// ─── DELETE: Cancel appointment ─────────────────────────────────

export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const id = req.nextUrl.searchParams.get('id');
      if (!id) {
        return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
      }

      const appointment = await d1
        .prepare('SELECT id, tenant_id, status FROM appointments WHERE id = ?')
        .bind(id)
        .first<{ id: string; tenant_id: string; status: string }>();

      if (!appointment) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== appointment.tenant_id) {
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

      await d1
        .prepare("UPDATE appointments SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?")
        .bind(id)
        .run();

      // Fetch updated
      const updated = await d1
        .prepare('SELECT * FROM appointments WHERE id = ?')
        .bind(id)
        .first<Record<string, unknown>>();

      return NextResponse.json({ appointment: updated });
    } catch (error) {
      console.error('Cancel appointment error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'] }
);