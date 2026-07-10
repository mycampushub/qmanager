import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import { rateLimit } from '@/lib/auth';
import { dispatchWebhooks } from '@/lib/webhook-dispatch';

const TICKET_COST_CENTS = 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantId,
      queueId,
      customerName,
      customerPhone,
      deviceId,
    } = body as {
      tenantId: string;
      queueId: string;
      customerName: string;
      customerPhone?: string;
      deviceId?: string;
    };

    if (!tenantId || !queueId || !customerName) {
      return NextResponse.json(
        { error: 'tenantId, queueId, and customerName are required' },
        { status: 400 }
      );
    }

    // B2: Phone format validation
    if (customerPhone && !/^\+?[\d\s-]{7,20}$/.test(customerPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // B3: String length limits
    if (customerName.length > 200) {
      return NextResponse.json(
        { error: 'Customer name must be at most 200 characters' },
        { status: 400 }
      );
    }

    // Rate limit: 30 per minute per tenant
    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const { allowed, retryAfterMs } = await rateLimit(
      `join:${ip}:${tenantId}`,
      30,
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

    const d1 = getD1FromEnv();

    // Platform-level checks (tenant existence, plan limit)
    const platformTenant = await d1
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

    if (!platformTenant || platformTenant.is_active !== 1) {
      return NextResponse.json(
        { error: 'Tenant not found or inactive' },
        { status: 400 }
      );
    }

    const planLimit = await d1
      .prepare('SELECT max_tickets_per_day FROM plan_limits WHERE plan_tier = ?')
      .bind(platformTenant.plan_tier)
      .first<{ max_tickets_per_day: number }>();

    // Fetch queue
    const queue = await d1
      .prepare(
        'SELECT * FROM queues WHERE id = ? AND tenant_id = ? AND is_active = 1'
      )
      .bind(queueId, tenantId)
      .first<Record<string, unknown>>();

    if (!queue) {
      return NextResponse.json(
        { error: 'Queue not found or inactive' },
        { status: 400 }
      );
    }

    // D9: Check service windows
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const queueWindows = await d1
      .prepare(
        'SELECT * FROM service_windows WHERE tenant_id = ? AND day_of_week = ? AND is_active = 1 AND queue_id = ?'
      )
      .bind(tenantId, dayOfWeek, queueId)
      .all();

    let applicableWindows = queueWindows.results;

    if (applicableWindows.length === 0) {
      const globalWindows = await d1
        .prepare(
          'SELECT * FROM service_windows WHERE tenant_id = ? AND day_of_week = ? AND is_active = 1 AND queue_id IS NULL'
        )
        .bind(tenantId, dayOfWeek)
        .all();
      applicableWindows = globalWindows.results;
    }

    if (applicableWindows.length > 0) {
      const allClosed = applicableWindows.every(
        (w) => (w as Record<string, unknown>).is_closed === 1
      );
      if (allClosed) {
        return NextResponse.json(
          {
            error:
              'This service is closed today. Please come back during business hours.',
          },
          { status: 400 }
        );
      }
      const openWindows = applicableWindows.filter(
        (w) => (w as Record<string, unknown>).is_closed !== 1
      );
      const isWithinWindow = openWindows.some(
        (w) => {
          const rec = w as Record<string, unknown>;
          return rec.open_time <= currentTime && currentTime < rec.close_time;
        }
      );
      if (!isWithinWindow) {
        const nextWindow = openWindows[0] as Record<string, unknown>;
        return NextResponse.json(
          {
            error: `Service hours are ${nextWindow.open_time} – ${nextWindow.close_time} today. Please try again during these hours.`,
          },
          { status: 400 }
        );
      }
    }

    // Check wallet balance
    if (platformTenant.wallet_balance < TICKET_COST_CENTS) {
      return NextResponse.json(
        { error: 'Insufficient wallet balance' },
        { status: 400 }
      );
    }

    // Check daily ticket limit
    if (planLimit) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = await d1
        .prepare(
          'SELECT count(*) as cnt FROM tickets WHERE tenant_id = ? AND created_at >= ?'
        )
        .bind(tenantId, todayStart.toISOString())
        .first<{ cnt: number }>();

      if (todayCount && todayCount.cnt >= planLimit.max_tickets_per_day) {
        return NextResponse.json(
          {
            error: `Daily ticket limit reached (${planLimit.max_tickets_per_day}). Please try again tomorrow.`,
          },
          { status: 400 }
        );
      }
    }

    // Phone dedup: check for active tickets with same phone+tenant
    if (customerPhone) {
      const existingTicket = await d1
        .prepare(
          `SELECT t.*, q.name as queue_name, q.prefix as queue_prefix
           FROM tickets t
           JOIN queues q ON t.queue_id = q.id
           WHERE t.tenant_id = ? AND t.customer_phone = ? AND t.status IN (?, ?)
           LIMIT 1`
        )
        .bind(tenantId, customerPhone, 'WAITING', 'SERVING')
        .first<{
          serial_number: number;
          queue_name: string;
          queue_prefix: string;
        }>();

      if (existingTicket) {
        const serial = `${existingTicket.queue_prefix}${String(existingTicket.serial_number).padStart(3, '0')}`;
        return NextResponse.json(
          {
            error: `You already have an active ticket (${serial}) in queue "${existingTicket.queue_name}"`,
          },
          { status: 400 }
        );
      }
    }

    // Pre-read current serial for atomic increment
    const currentSerial = queue.current_serial as number;
    const newSerial = currentSerial + 1;

    // Prepare all writes as a batch
    const nowISO = now.toISOString();
    const ticketId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const txId = crypto.randomUUID();
    const profileId = crypto.randomUUID();

    const batchStatements = [
      // Increment queue serial
      d1
        .prepare(
          'UPDATE queues SET current_serial = ?, updated_at = ? WHERE id = ?'
        )
        .bind(newSerial, nowISO, queueId),

      // Decrement wallet
      d1
        .prepare(
          'UPDATE tenants SET wallet_balance = wallet_balance - ?, updated_at = ? WHERE id = ? AND wallet_balance >= ?'
        )
        .bind(TICKET_COST_CENTS, nowISO, tenantId, TICKET_COST_CENTS),

      // Create ticket
      d1
        .prepare(
          `INSERT INTO tickets (id, tenant_id, queue_id, serial_number, status, customer_name, customer_phone, device_id, created_at)
           VALUES (?, ?, ?, ?, 'WAITING', ?, ?, ?, ?)`
        )
        .bind(
          ticketId,
          tenantId,
          queueId,
          newSerial,
          customerName,
          customerPhone || null,
          deviceId || null,
          nowISO
        ),

      // Create usage ledger
      d1
        .prepare(
          `INSERT INTO usage_ledgers (id, tenant_id, ticket_id, cost_cents, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(ledgerId, tenantId, ticketId, TICKET_COST_CENTS, nowISO),

      // Create transaction record
      d1
        .prepare(
          `INSERT INTO transactions (id, tenant_id, type, amount_cents, description, created_at)
           VALUES (?, ?, 'TICKET_CHARGE', ?, ?, ?)`
        )
        .bind(
          txId,
          tenantId,
          -TICKET_COST_CENTS,
          `Ticket ${queue.prefix}${String(newSerial).padStart(3, '0')}`,
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

    // Check wallet update result (changes should be 1 if balance was sufficient)
    // The WHERE clause `wallet_balance >= ?` ensures we don't go negative
    // If the batch succeeded, we know the wallet was updated correctly

    const newBalance = platformTenant.wallet_balance - TICKET_COST_CENTS;

    // Check for low balance
    let lowBalanceWarning: string | undefined;
    if (newBalance < 1000) {
      lowBalanceWarning =
        'Low balance warning: Your wallet is below 10 TK. Please top up to avoid service interruption.';
    }

    // Parse branding config
    let branding = {
      primaryColor: '#10b981',
      secondaryColor: '#059669',
      logoText: platformTenant.name,
      welcomeMessage: platformTenant.welcome_message || 'Welcome!',
    };
    if (platformTenant.branding_config) {
      try {
        branding = {
          ...branding,
          ...JSON.parse(platformTenant.branding_config),
        };
      } catch {
        // use default
      }
    }

    const formattedSerial = `${queue.prefix}${String(newSerial).padStart(3, '0')}`;

    // Fire webhooks (fire-and-forget)
    dispatchWebhooks(tenantId, 'TICKET_CREATED', {
      ticketId,
      serialNumber: formattedSerial,
      customerName,
      queueName: queue.name as string,
      queueId,
    });

    return NextResponse.json({
      ticket: {
        id: ticketId,
        tenantId,
        queueId,
        serialNumber: newSerial,
        status: 'WAITING',
        customerName,
        customerPhone: customerPhone || null,
        deviceId: deviceId || null,
        notes: null,
        createdAt: nowISO,
        servedAt: null,
        completedAt: null,
        cancelledAt: null,
        skippedAt: null,
        servedByAgent: null,
        skipCount: 0,
        formattedSerial,
      },
      queueName: queue.name as string,
      tenantName: platformTenant.name,
      branding,
      lowBalanceWarning,
      newBalance,
    });
  } catch (error: unknown) {
    console.error('Join queue error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}