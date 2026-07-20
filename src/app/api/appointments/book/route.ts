import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import { rateLimit } from '@/lib/auth';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';
import { emitWSEvent } from '@/lib/ws-emit';
import { getClientIp } from '@/lib/utils';

const TICKET_COST_CENTS = 100;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantId,
      queueId,
      customerName,
      customerPhone,
      scheduledDate,
      notes,
    } = body as {
      tenantId: string;
      queueId: string;
      customerName: string;
      customerPhone?: string;
      scheduledDate: string;
      notes?: string;
    };

    if (!tenantId || !queueId || !customerName || !scheduledDate) {
      return NextResponse.json(
        { error: 'tenantId, queueId, customerName, and scheduledDate are required' },
        { status: 400 }
      );
    }

    // Validate inputs
    if (customerName.length > 200) {
      return NextResponse.json(
        { error: 'Customer name must be at most 200 characters' },
        { status: 400 }
      );
    }
    if (customerPhone && !/^\+?[\d\s-]{7,20}$/.test(customerPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }
    if (!DATE_REGEX.test(scheduledDate)) {
      return NextResponse.json(
        { error: 'scheduledDate must be in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    // Validate date is today or in the future
    const clientTimezone = req.headers.get('X-Timezone') || 'Asia/Dhaka';
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: clientTimezone }).format(now);
    if (scheduledDate < todayStr) {
      return NextResponse.json(
        { error: 'Cannot book for a past date' },
        { status: 400 }
      );
    }

    // Rate limit: 15 per minute per IP+tenant
    const ip = getClientIp(req);
    const { allowed, retryAfterMs } = await rateLimit(
      `book:${ip}:${tenantId}`,
      15,
      60_000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    const d1 = await getD1FromEnv();

    // ── Validate tenant ──
    const tenant = await d1
      .prepare(
        'SELECT id, name, plan_tier, wallet_balance, branding_config, welcome_message, is_active FROM tenants WHERE id = ?'
      )
      .bind(tenantId)
      .first<{
        id: string;
        name: string;
        plan_tier: string;
        wallet_balance: number;
        branding_config: string | null;
        welcome_message: string | null;
        is_active: number;
      }>();

    if (!tenant || tenant.is_active !== 1) {
      return NextResponse.json(
        { error: 'Business not found or inactive' },
        { status: 400 }
      );
    }

    // ── Validate queue ──
    const queue = await d1
      .prepare('SELECT * FROM queues WHERE id = ? AND tenant_id = ? AND is_active = 1')
      .bind(queueId, tenantId)
      .first<Record<string, unknown>>();

    if (!queue) {
      return NextResponse.json(
        { error: 'Queue not found or inactive' },
        { status: 400 }
      );
    }

    // ── Validate service windows exist for the scheduled date ──
    const scheduledDayOfWeek = getDayOfWeek(scheduledDate, clientTimezone);

    const queueWindows = await d1
      .prepare(
        'SELECT * FROM service_windows WHERE tenant_id = ? AND day_of_week = ? AND is_active = 1 AND queue_id = ?'
      )
      .bind(tenantId, scheduledDayOfWeek, queueId)
      .all<Record<string, unknown>>();

    let applicableWindows = queueWindows.results;

    if (applicableWindows.length === 0) {
      const globalWindows = await d1
        .prepare(
          'SELECT * FROM service_windows WHERE tenant_id = ? AND day_of_week = ? AND is_active = 1 AND queue_id IS NULL'
        )
        .bind(tenantId, scheduledDayOfWeek)
        .all<Record<string, unknown>>();
      applicableWindows = globalWindows.results;
    }

    if (applicableWindows.length === 0) {
      return NextResponse.json(
        { error: 'No service available on this date. Please choose a different day.' },
        { status: 400 }
      );
    }

    const allClosed = applicableWindows.every((w) => w.is_closed === 1);
    if (allClosed) {
      return NextResponse.json(
        { error: 'This service is closed on the selected date. Please choose a different day.' },
        { status: 400 }
      );
    }

    // Find the earliest open window for EWT calculation
    const openWindows = applicableWindows.filter((w) => w.is_closed !== 1);
    const earliestOpenTime = openWindows
      .map((w) => String(w.open_time))
      .sort()[0];

    // ── Check plan daily limit ──
    const planLimit = await d1
      .prepare('SELECT max_tickets_per_day FROM plan_limits WHERE plan_tier = ?')
      .bind(tenant.plan_tier)
      .first<{ max_tickets_per_day: number }>();

    if (planLimit) {
      const [ticketCount, apptCount] = await d1.batch([
        d1
          .prepare(
            "SELECT count(*) as cnt FROM tickets WHERE tenant_id = ? AND created_at >= ?"
          )
          .bind(tenantId, todayStr),
        d1
          .prepare(
            "SELECT count(*) as cnt FROM appointments WHERE tenant_id = ? AND scheduled_date = ? AND status NOT IN ('CANCELLED', 'NO_SHOW')"
          )
          .bind(tenantId, todayStr),
      ]);

      const todayTickets = ((ticketCount.results as { cnt: number }[])[0]?.cnt) ?? 0;
      const todayAppts = ((apptCount.results as { cnt: number }[])[0]?.cnt) ?? 0;

      if (todayTickets + todayAppts >= planLimit.max_tickets_per_day) {
        return NextResponse.json(
          { error: 'Daily booking limit reached. Please try again tomorrow.' },
          { status: 400 }
        );
      }
    }

    // ── Check wallet balance ──
    if (tenant.wallet_balance < TICKET_COST_CENTS) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again later.' },
        { status: 400 }
      );
    }

    // ── Phone dedup: check for existing active ticket OR booking for same date+queue ──
    if (customerPhone) {
      // Check existing WAITING/SERVING tickets
      const existingTicket = await d1
        .prepare(
          `SELECT t.id, t.serial_number, q.name as queue_name, q.prefix as queue_prefix
           FROM tickets t
           JOIN queues q ON t.queue_id = q.id
           WHERE t.tenant_id = ? AND t.customer_phone = ? AND t.status IN (?, ?)
           LIMIT 1`
        )
        .bind(tenantId, customerPhone, 'WAITING', 'SERVING')
        .first<{
          id: string;
          serial_number: number;
          queue_name: string;
          queue_prefix: string;
        }>();

      if (existingTicket) {
        const serial = `${existingTicket.queue_prefix}${String(existingTicket.serial_number).padStart(3, '0')}`;
        return NextResponse.json(
          {
            code: 'DUPLICATE_TICKET',
            error: `You already have an active ticket (${serial}) in queue "${existingTicket.queue_name}"`,
            existingTicketId: existingTicket.id,
            existingTenantId: tenantId,
          },
          { status: 400 }
        );
      }

      // Check existing booking for same date+queue+phone
      const existingBooking = await d1
        .prepare(
          `SELECT a.id, a.ticket_id, a.status, q.name as queue_name, q.prefix as queue_prefix
           FROM appointments a
           JOIN queues q ON a.queue_id = q.id
           WHERE a.tenant_id = ? AND a.queue_id = ? AND a.scheduled_date = ? AND a.customer_phone = ?
             AND a.status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
           LIMIT 1`
        )
        .bind(tenantId, queueId, scheduledDate, customerPhone)
        .first<{
          id: string;
          ticket_id: string | null;
          status: string;
          queue_name: string;
          queue_prefix: string;
        }>();

      if (existingBooking) {
        if (existingBooking.ticket_id) {
          return NextResponse.json(
            {
              code: 'DUPLICATE_BOOKING',
              error: `You already have a booking for this queue on ${scheduledDate}. Your ticket is being tracked.`,
              existingTicketId: existingBooking.ticket_id,
              existingTenantId: tenantId,
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          {
            code: 'DUPLICATE_BOOKING',
            error: `You already have a booking for this queue on ${scheduledDate}.`,
            existingTenantId: tenantId,
          },
          { status: 400 }
        );
      }
    }

    // ── Create ticket + appointment in atomic batch ──
    const nowISO = new Date().toISOString();
    const ticketId = crypto.randomUUID();
    const apptId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const txId = crypto.randomUUID();
    const profileId = crypto.randomUUID();

    // Get next booking_order for this queue+date
    const orderResult = await d1
      .prepare(
        `SELECT COALESCE(MAX(booking_order), 0) + 1 as next_order
         FROM appointments WHERE tenant_id = ? AND queue_id = ? AND scheduled_date = ?`
      )
      .bind(tenantId, queueId, scheduledDate)
      .first<{ next_order: number }>();
    const bookingOrder = orderResult?.next_order ?? 1;

    const batchStatements = [
      // Atomically increment queue serial
      d1
        .prepare(
          'UPDATE queues SET current_serial = current_serial + 1, updated_at = ? WHERE id = ?'
        )
        .bind(nowISO, queueId),

      // Decrement wallet
      d1
        .prepare(
          'UPDATE tenants SET wallet_balance = wallet_balance - ?, updated_at = ? WHERE id = ? AND wallet_balance >= ?'
        )
        .bind(TICKET_COST_CENTS, nowISO, tenantId, TICKET_COST_CENTS),

      // Create ticket with ONLINE_BOOKING source
      d1
        .prepare(
          `INSERT INTO tickets (id, tenant_id, queue_id, serial_number, status, customer_name, customer_phone, notes, source, created_at)
           VALUES (?, ?, ?, (SELECT current_serial FROM queues WHERE id = ?), 'WAITING', ?, ?, ?, 'ONLINE_BOOKING', ?)`
        )
        .bind(
          ticketId,
          tenantId,
          queueId,
          queueId,
          customerName,
          customerPhone || null,
          notes || null,
          nowISO
        ),

      // Create appointment record linking to ticket
      d1
        .prepare(
          `INSERT INTO appointments (id, tenant_id, queue_id, customer_name, customer_phone, scheduled_date, scheduled_time, status, notes, ticket_id, source, booking_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '', 'CONFIRMED', ?, ?, 'ONLINE', ?, ?, ?)`
        )
        .bind(
          apptId,
          tenantId,
          queueId,
          customerName,
          customerPhone || null,
          scheduledDate,
          notes || null,
          ticketId,
          bookingOrder,
          nowISO,
          nowISO
        ),

      // Create usage ledger
      d1
        .prepare(
          `INSERT INTO usage_ledgers (id, tenant_id, ticket_id, cost_cents, created_at) VALUES (?, ?, ?, ?, ?)`
        )
        .bind(ledgerId, tenantId, ticketId, TICKET_COST_CENTS, nowISO),

      // Create transaction record
      d1
        .prepare(
          `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_at)
           VALUES (?, ?, 'TICKET_CHARGE', ?, (SELECT 'Online booking: ' || prefix || printf('%03d', current_serial) FROM queues WHERE id = ?), ?)`
        )
        .bind(
          txId,
          tenantId,
          -TICKET_COST_CENTS,
          queueId,
          nowISO
        ),
    ];

    // Upsert customer profile if phone provided
    if (customerPhone) {
      batchStatements.push(
        d1
          .prepare(
            `INSERT INTO customer_profiles (id, tenant_id, phone, name, total_visits, total_tickets, last_visit_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)
             ON CONFLICT(tenant_id, phone) DO UPDATE SET
               total_visits = total_visits + 1,
               total_tickets = total_tickets + 1,
               name = excluded.name,
               last_visit_at = excluded.last_visit_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            profileId,
            tenantId,
            customerPhone,
            customerName,
            nowISO,
            nowISO,
            nowISO
          )
      );
    }

    await d1.batch(batchStatements);

    // ── Read the new serial from the updated queue (post-batch) ──
    const updatedQueue = await d1
      .prepare('SELECT current_serial, prefix FROM queues WHERE id = ?')
      .bind(queueId)
      .first<{ current_serial: number; prefix: string }>();
    const newSerial = updatedQueue?.current_serial ?? 0;
    const newBalance = tenant.wallet_balance - TICKET_COST_CENTS;
    const formattedSerial = `${updatedQueue?.prefix || 'A'}${String(newSerial).padStart(3, '0')}`;

    // ── Calculate EWT (estimated service time) ──
    const [aheadResult, avgServiceResult, servingCountResult, counterCountResult] =
      await Promise.all([
        d1
          .prepare(
            'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ? AND serial_number < ?'
          )
          .bind(queueId, 'WAITING', newSerial)
          .first<{ cnt: number }>(),
        d1
          .prepare(
            'SELECT duration_seconds FROM service_logs WHERE tenant_id = ? AND queue_id = ? AND duration_seconds IS NOT NULL ORDER BY created_at DESC LIMIT 20'
          )
          .bind(tenantId, queueId)
          .all<{ duration_seconds: number }>(),
        d1
          .prepare(
            'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
          )
          .bind(queueId, 'SERVING')
          .first<{ cnt: number }>(),
        d1
          .prepare(
            'SELECT count(*) as cnt FROM service_counters WHERE queue_id = ? AND is_active = 1'
          )
          .bind(queueId)
          .first<{ cnt: number }>(),
      ]);

    const peopleAhead = aheadResult?.cnt ?? 0;
    const avgServiceSec =
      avgServiceResult.results.length > 0
        ? Math.round(
            avgServiceResult.results.reduce(
              (sum, s) => sum + s.duration_seconds,
              0
            ) / avgServiceResult.results.length
          )
        : (queue.default_service_time_sec as number);

    const servingCount = servingCountResult?.cnt ?? 0;
    const counterCount = counterCountResult?.cnt ?? 0;
    const activePositions = Math.max(
      servingCount + 1,
      counterCount > 0 ? counterCount : 1
    );
    const rawEwt = (peopleAhead + 1) * avgServiceSec;
    const ewt = Math.ceil(rawEwt / activePositions);

    // Calculate absolute estimated service time
    const estimatedServiceTime = calculateEstimatedServiceTime(
      earliestOpenTime,
      ewt,
      clientTimezone
    );

    // Parse branding config
    let branding = {
      primaryColor: '#10b981',
      secondaryColor: '#059669',
      logoText: tenant.name,
      welcomeMessage: tenant.welcome_message || 'Welcome!',
    };
    if (tenant.branding_config) {
      try {
        branding = { ...branding, ...JSON.parse(tenant.branding_config) };
      } catch {
        // use default
      }
    }

    // Check for low balance
    let lowBalanceWarning: string | undefined;
    if (newBalance < 1000) {
      lowBalanceWarning =
        'Low balance warning: Service may become unavailable soon.';
    }

    // Fire webhooks (fire-and-forget)
    dispatchWebhooks(tenantId, 'TICKET_CREATED', {
      ticketId,
      serialNumber: formattedSerial,
      customerName,
      queueName: queue.name as string,
      queueId,
      source: 'ONLINE_BOOKING',
    });

    // Emit WebSocket event for real-time updates
    emitWSEvent(tenantId, 'TICKET_CREATED', {
      ticketId,
      serialNumber: formattedSerial,
      customerName,
      queueName: queue.name as string,
      queueId,
      source: 'ONLINE_BOOKING',
    });

    return NextResponse.json(
      {
        ticket: {
          id: ticketId,
          tenantId,
          queueId,
          serialNumber: newSerial,
          status: 'WAITING',
          customerName,
          customerPhone: customerPhone || null,
          source: 'ONLINE_BOOKING',
          createdAt: nowISO,
          _formattedSerial: formattedSerial,
          _peopleAhead: peopleAhead + 1,
          _ewt: ewt,
          _estimatedServiceTime: estimatedServiceTime,
          _serviceOpensAt: earliestOpenTime,
        },
        appointment: {
          id: apptId,
          scheduledDate,
          status: 'CONFIRMED',
          source: 'ONLINE',
          bookingOrder: bookingOrder,
        },
        queueName: queue.name as string,
        tenantName: tenant.name,
        branding,
        lowBalanceWarning,
        trackingUrl: `?ticket=${ticketId}`,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Online booking error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Get the day of week (0=Sun, 6=Sat) for a given date string in a timezone.
 */
function getDayOfWeek(dateStr: string, timezone: string): number {
  try {
    // Parse YYYY-MM-DD into a Date at midnight in the given timezone
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateInTz = new Date(Date.UTC(year, month - 1, day));
    const dayName = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(dateInTz);
    return DAY_MAP[dayName] ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Calculate absolute estimated service time by adding EWT to service open time.
 * Returns formatted time like "09:15 AM" or "2:30 PM".
 */
function calculateEstimatedServiceTime(
  openTime: string,
  ewtSeconds: number,
  timezone: string
): string {
  try {
    const [h, m] = openTime.split(':').map(Number);
    const now = new Date();

    // Build a date for today in the given timezone at the open time
    const openDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        h,
        m,
        0
      )
    );

    // Add EWT
    const estimatedDate = new Date(
      openDate.getTime() + ewtSeconds * 1000
    );

    // Format in the given timezone
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(estimatedDate);
  } catch {
    // Fallback: just show relative time
    const minutes = Math.ceil(ewtSeconds / 60);
    return `~${minutes} min after opening`;
  }
}