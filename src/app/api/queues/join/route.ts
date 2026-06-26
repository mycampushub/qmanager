import { NextRequest, NextResponse } from 'next/server';
import { db, withTenantCtx } from '@/lib/db';
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
    const { allowed, retryAfterMs } = rateLimit('join:' + tenantId, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    // Platform-level checks (tenant existence, plan limit) — outside tenant context
    const platformTenant = await db.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!platformTenant || !platformTenant.isActive) {
      return NextResponse.json(
        { error: 'Tenant not found or inactive' },
        { status: 400 }
      );
    }

    const planLimit = await db.planLimit.findUnique({
      where: { planTier: platformTenant.planTier },
    });

    // Tenant-level operations in isolated tenant database
    const result = await withTenantCtx(tenantId, async () => {
      return db.$transaction(async (tx) => {
        // Fetch queue inside transaction
        const queue = await tx.queue.findUnique({
          where: { id: queueId },
        });

        if (!queue || !queue.isActive || queue.tenantId !== tenantId) {
          throw new Error('Queue not found or inactive');
        }

        // D9: Check service windows — is the business open right now?
        const now = new Date();
        const dayOfWeek = now.getDay();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const queueWindows = await tx.serviceWindow.findMany({
          where: { tenantId, dayOfWeek, isActive: true, queueId },
        });
        const globalWindows = queueWindows.length > 0 ? [] : await tx.serviceWindow.findMany({
          where: { tenantId, dayOfWeek, isActive: true, queueId: null },
        });
        const applicableWindows = queueWindows.length > 0 ? queueWindows : globalWindows;

        if (applicableWindows.length > 0) {
          const allClosed = applicableWindows.every((w) => w.isClosed);
          if (allClosed) {
            throw new Error('This service is closed today. Please come back during business hours.');
          }
          const openWindows = applicableWindows.filter((w) => !w.isClosed);
          const isWithinWindow = openWindows.some(
            (w) => w.openTime <= currentTime && currentTime < w.closeTime
          );
          if (!isWithinWindow) {
            const nextWindow = openWindows[0];
            throw new Error(
              `Service hours are ${nextWindow.openTime} – ${nextWindow.closeTime} today. Please try again during these hours.`
            );
          }
        }

        // Check wallet balance from the tenant DB's Tenant record
        const tenantInDb = await tx.tenant.findUnique({
          where: { id: tenantId },
        });

        if (!tenantInDb || tenantInDb.walletBalance < TICKET_COST_CENTS) {
          throw new Error('Insufficient wallet balance');
        }

        // FIX B15: Check plan limits - maxTicketsPerDay (from pre-fetched platform data)
        if (planLimit) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayTicketCount = await tx.ticket.count({
            where: {
              tenantId,
              createdAt: { gte: todayStart },
            },
          });
          if (todayTicketCount >= planLimit.maxTicketsPerDay) {
            throw new Error(
              `Daily ticket limit reached (${planLimit.maxTicketsPerDay}). Please try again tomorrow.`
            );
          }
        }

        // Phone dedup: check inside transaction for active tickets with same phone+tenant
        if (customerPhone) {
          const existingTicket = await tx.ticket.findFirst({
            where: {
              tenantId,
              customerPhone,
              status: { in: ['WAITING', 'SERVING'] },
            },
          });
          if (existingTicket) {
            const existingQueue = await tx.queue.findUnique({
              where: { id: existingTicket.queueId },
            });
            const serial = `${existingQueue!.prefix}${String(existingTicket.serialNumber).padStart(3, '0')}`;
            throw new Error(
              `You already have an active ticket (${serial}) in queue "${existingQueue!.name}"`
            );
          }
        }

        // Increment serial atomically
        const updatedQueue = await tx.queue.update({
          where: { id: queueId },
          data: { currentSerial: { increment: 1 } },
        });

        const newSerial = updatedQueue.currentSerial;

        // Decrement wallet in tenant DB
        const updatedTenant = await tx.tenant.update({
          where: { id: tenantId },
          data: { walletBalance: { decrement: TICKET_COST_CENTS } },
        });

        // Create ticket
        const ticket = await tx.ticket.create({
          data: {
            tenantId,
            queueId,
            serialNumber: newSerial,
            status: 'WAITING',
            customerName,
            customerPhone: customerPhone || null,
            deviceId: deviceId || null, // FIX B4: store deviceId
          },
        });

        // Create usage ledger
        await tx.usageLedger.create({
          data: {
            tenantId,
            ticketId: ticket.id,
            costCents: TICKET_COST_CENTS,
          },
        });

        // Create transaction record
        await tx.transaction.create({
          data: {
            tenantId,
            type: 'TICKET_CHARGE',
            amountCents: -TICKET_COST_CENTS,
            description: `Ticket ${queue.prefix}${String(newSerial).padStart(3, '0')}`,
          },
        });

        // D8: Upsert customer profile for repeat customer recognition
        if (customerPhone) {
          await tx.customerProfile.upsert({
            where: { tenantId_phone: { tenantId, phone: customerPhone } },
            create: {
              tenantId,
              phone: customerPhone,
              name: customerName,
              totalVisits: 1,
              totalTickets: 1,
            },
            update: {
              totalVisits: { increment: 1 },
              totalTickets: { increment: 1 },
              name: customerName,
              lastVisitAt: now,
            },
          }).catch(() => { /* ignore upsert conflicts */ });
        }

        // Check for low balance (FIX B17)
        let lowBalanceWarning: string | undefined;
        if (updatedTenant.walletBalance < 1000) {
          lowBalanceWarning =
            'Low balance warning: Your wallet is below 10 TK. Please top up to avoid service interruption.';
        }

        // Parse branding config (FIX E14)
        let branding = {
          primaryColor: '#10b981',
          secondaryColor: '#059669',
          logoText: platformTenant.name,
          welcomeMessage: platformTenant.welcomeMessage || 'Welcome!',
        };
        if (platformTenant.brandingConfig) {
          try {
            branding = { ...branding, ...JSON.parse(platformTenant.brandingConfig) };
          } catch {
            // use default
          }
        }

        return {
          ticket,
          queueName: queue.name,
          queuePrefix: queue.prefix,
          tenantName: platformTenant.name,
          branding,
          lowBalanceWarning,
          newBalance: updatedTenant.walletBalance,
        };
      });
    });

    const formattedSerial = `${result.queuePrefix}${String(result.ticket.serialNumber).padStart(3, '0')}`;

    // D7: Fire webhooks (fire-and-forget)
    dispatchWebhooks(tenantId, 'TICKET_CREATED', {
      ticketId: result.ticket.id,
      serialNumber: formattedSerial,
      customerName,
      queueName: result.queueName,
      queueId,
    });

    return NextResponse.json({
      ticket: {
        ...result.ticket,
        formattedSerial,
      },
      queueName: result.queueName,
      tenantName: result.tenantName,
      branding: result.branding,
      lowBalanceWarning: result.lowBalanceWarning,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';

    if (
      message.includes('not found') ||
      message.includes('inactive') ||
      message.includes('Insufficient') ||
      message.includes('limit reached') ||
      message.includes('already have an active ticket')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('Join queue error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}