import { NextRequest, NextResponse } from 'next/server';
import { db, withTenantCtx } from '@/lib/db';
import { rateLimit } from '@/lib/auth';
import { withAuth } from '@/lib/api-auth';
import type { JwtPayload } from '@/lib/auth';

// POST: Find tickets by queueId + optional status filter (for AgentView)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { queueId, status } = body as {
        queueId: string;
        status?: string;
      };

      if (!queueId) {
        return NextResponse.json(
          { error: 'queueId is required' },
          { status: 400 }
        );
      }

      // Tenant isolation: verify queue belongs to user's tenant
      const queue = await db.queue.findUnique({
        where: { id: queueId },
        select: { tenantId: true, name: true, prefix: true },
      });

      if (!queue || queue.tenantId !== user.tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      const where: Record<string, unknown> = {
        queueId,
        tenantId: user.tenantId,
      };

      // B12: Validate status against allowed values
      const VALID_STATUSES = ['WAITING', 'SERVING', 'COMPLETED', 'CANCELLED', 'SKIPPED'];
      if (status) {
        if (!VALID_STATUSES.includes(status)) {
          return NextResponse.json(
            { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
            { status: 400 }
          );
        }
        where.status = status;
      }

      const ticket = await db.ticket.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          queue: true,
          tenant: { select: { name: true } },
        },
      });

      if (!ticket) {
        return NextResponse.json(
          { error: 'No matching ticket found' },
          { status: 404 }
        );
      }

      const formattedSerial = `${ticket.queue.prefix}${String(ticket.serialNumber).padStart(3, '0')}`;

      // Calculate position and EWT if ticket is WAITING
      let position: number | undefined;
      let ewt: number | undefined;

      if (ticket.status === 'WAITING') {
        const waitingAhead = await db.ticket.count({
          where: {
            queueId: ticket.queueId,
            status: 'WAITING',
            serialNumber: { lt: ticket.serialNumber },
          },
        });
        position = waitingAhead + 1;

        const serviceLogs = await db.serviceLog.findMany({
          where: {
            tenantId: ticket.tenantId,
            queueId: ticket.queueId,
            durationSeconds: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { durationSeconds: true },
        });

        const avgServiceTime =
          serviceLogs.length > 0
            ? Math.round(
                serviceLogs.reduce(
                  (sum, s) => sum + (s.durationSeconds ?? 0),
                  0
                ) / serviceLogs.length
              )
            : ticket.queue.defaultServiceTimeSec;

        ewt = (waitingAhead + 1) * avgServiceTime;
      }

      return NextResponse.json({
        ticket: {
          ...ticket,
          formattedSerial,
          position,
          ewt,
        },
      });
    } catch (error) {
      console.error('Ticket status POST error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'AGENT'], requireTenantId: true }
);

export async function GET(req: NextRequest) {
  try {
    const ticketId = req.nextUrl.searchParams.get('ticketId');
    const phone = req.nextUrl.searchParams.get('phone');
    const tenantIdParam = req.nextUrl.searchParams.get('tenantId');
    // B10: Clamp page ≥ 1, limit 1-100
    let page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10);
    let limit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const dateFrom = req.nextUrl.searchParams.get('dateFrom');
    const dateTo = req.nextUrl.searchParams.get('dateTo');

    // B11: Validate date strings
    if (dateFrom && isNaN(new Date(dateFrom).getTime())) {
      return NextResponse.json({ error: 'Invalid dateFrom format' }, { status: 400 });
    }
    if (dateTo && isNaN(new Date(dateTo).getTime())) {
      return NextResponse.json({ error: 'Invalid dateTo format' }, { status: 400 });
    }

    if (!ticketId && (!phone || !tenantIdParam)) {
      return NextResponse.json(
        { error: 'Provide ticketId + tenantId OR (phone + tenantId)' },
        { status: 400 }
      );
    }

    if (ticketId && !tenantIdParam) {
      return NextResponse.json(
        { error: 'tenantId is required with ticketId for tenant context routing' },
        { status: 400 }
      );
    }

    const tenantId = tenantIdParam!;

    // Rate limit
    const rlKey = ticketId || phone || 'unknown';
    const { allowed, retryAfterMs } = rateLimit(
      'status:' + rlKey,
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

    // Single ticket lookup — wrapped in tenant context
    if (ticketId) {
      const result = await withTenantCtx(tenantId, async () => {
        const ticket = await db.ticket.findUnique({
          where: { id: ticketId },
          include: {
            queue: true,
          },
        });

        if (!ticket) {
          return null;
        }

        const waitingAhead = await db.ticket.count({
          where: {
            queueId: ticket.queueId,
            status: 'WAITING',
            serialNumber: { lt: ticket.serialNumber },
          },
        });

        const serviceLogs = await db.serviceLog.findMany({
          where: {
            tenantId: ticket.tenantId,
            queueId: ticket.queueId,
            durationSeconds: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { durationSeconds: true },
        });

        const avgServiceTime =
          serviceLogs.length > 0
            ? Math.round(
                serviceLogs.reduce(
                  (sum, s) => sum + (s.durationSeconds ?? 0),
                  0
                ) / serviceLogs.length
              )
            : ticket.queue.defaultServiceTimeSec;

        const ewt = (waitingAhead + 1) * avgServiceTime;
        const formattedSerial = `${ticket.queue.prefix}${String(ticket.serialNumber).padStart(3, '0')}`;

        return { ticket, waitingAhead, ewt, formattedSerial };
      });

      if (!result) {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ticket: {
          id: result.ticket.id,
          queueId: result.ticket.queueId,
          serialNumber: result.ticket.serialNumber,
          status: result.ticket.status,
          _formattedSerial: result.formattedSerial,
          _peopleAhead: result.waitingAhead + 1,
          _ewt: result.ewt,
          queue: {
            name: result.ticket.queue.name,
          },
        },
      });
    }

    // Phone lookup with pagination and date filter — wrapped in tenant context
    const ticketsWithPosition = await withTenantCtx(tenantId, async () => {
      const phoneFilter: Record<string, unknown> = {
        customerPhone: phone,
        tenantId,
      };

      if (dateFrom || dateTo) {
        const dateRange: Record<string, Date> = {};
        if (dateFrom) dateRange.gte = new Date(dateFrom);
        if (dateTo) {
          const d = new Date(dateTo);
          d.setHours(23, 59, 59, 999);
          dateRange.lte = d;
        }
        phoneFilter.createdAt = dateRange;
      }

      const [tickets, total] = await Promise.all([
        db.ticket.findMany({
          where: phoneFilter,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            queue: { select: { name: true, prefix: true, defaultServiceTimeSec: true, tenantId: true } },
          },
        }),
        db.ticket.count({ where: phoneFilter }),
      ]);

      const enriched = await Promise.all(
        tickets.map(async (t) => {
          let position: number | undefined;
          let ewt: number | undefined;

          if (t.status === 'WAITING') {
            const waitingAhead = await db.ticket.count({
              where: {
                queueId: t.queueId,
                status: 'WAITING',
                serialNumber: { lt: t.serialNumber },
              },
            });
            position = waitingAhead + 1;

            const serviceLogs = await db.serviceLog.findMany({
              where: {
                tenantId: t.queue.tenantId,
                queueId: t.queueId,
                durationSeconds: { not: null },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: { durationSeconds: true },
            });

            const avgServiceTime =
              serviceLogs.length > 0
                ? Math.round(
                    serviceLogs.reduce(
                      (sum, s) => sum + (s.durationSeconds ?? 0),
                      0
                    ) / serviceLogs.length
                  )
                : t.queue.defaultServiceTimeSec;

            ewt = (waitingAhead + 1) * avgServiceTime;
          }

          return {
            id: t.id,
            queueId: t.queueId,
            serialNumber: t.serialNumber,
            status: t.status,
            formattedSerial: `${t.queue.prefix}${String(t.serialNumber).padStart(3, '0')}`,
            position,
            ewt,
          };
        })
      );

      return { tickets: enriched, total };
    });

    return NextResponse.json({
      tickets: ticketsWithPosition.tickets,
      pagination: {
        page,
        limit,
        total: ticketsWithPosition.total,
        pages: Math.ceil(ticketsWithPosition.total / limit),
      },
    });
  } catch (error) {
    console.error('Ticket status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}