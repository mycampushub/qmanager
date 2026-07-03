import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';
import { rateLimit } from '@/lib/auth';
import { withAuth, type JwtPayload } from '@/lib/api-auth';

// Helper: compute avg service time for a queue
async function getAvgServiceTime(
  d1: D1Database,
  tenantId: string,
  queueId: string,
  fallback: number
): Promise<number> {
  const result = await d1
    .prepare(
      'SELECT duration_seconds FROM service_logs WHERE tenant_id = ? AND queue_id = ? AND duration_seconds IS NOT NULL ORDER BY created_at DESC LIMIT 20'
    )
    .bind(tenantId, queueId)
    .all<{ duration_seconds: number }>();

  if (result.results.length === 0) return fallback;
  return Math.round(
    result.results.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) /
      result.results.length
  );
}

// Helper: compute waiting ahead count for a ticket
async function getWaitingAhead(
  d1: D1Database,
  queueId: string,
  serialNumber: number
): Promise<number> {
  const result = await d1
    .prepare(
      'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ? AND serial_number < ?'
    )
    .bind(queueId, 'WAITING', serialNumber)
    .first<{ cnt: number }>();
  return result?.cnt ?? 0;
}

// POST: Find ticket by queueId + optional status filter (for AgentView)
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

      const tenantId = user.tenantId!;

      // Tenant isolation: verify queue belongs to user's tenant
      const queue = await d1
        .prepare(
          'SELECT tenant_id, name, prefix, default_service_time_sec FROM queues WHERE id = ?'
        )
        .bind(queueId)
        .first<{
          tenant_id: string;
          name: string;
          prefix: string;
          default_service_time_sec: number;
        }>();

      if (!queue || queue.tenant_id !== tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      // B12: Validate status against allowed values
      const VALID_STATUSES = [
        'WAITING',
        'SERVING',
        'COMPLETED',
        'CANCELLED',
        'SKIPPED',
      ];
      if (status && !VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          },
          { status: 400 }
        );
      }

      // Build query
      let sql = `SELECT t.*, q.name as queue_name, q.prefix as queue_prefix, q.default_service_time_sec as queue_default_service_time_sec
                 FROM tickets t
                 JOIN queues q ON t.queue_id = q.id
                 WHERE t.queue_id = ? AND t.tenant_id = ?`;
      const bindValues: unknown[] = [queueId, tenantId];

      if (status) {
        sql += ' AND t.status = ?';
        bindValues.push(status);
      }

      sql += ' ORDER BY t.created_at DESC LIMIT 1';

      const d1 = await getD1FromEnv();
      const ticket = await d1
        .prepare(sql)
        .bind(...bindValues)
        .first<Record<string, unknown>>();

      if (!ticket) {
        return NextResponse.json(
          { error: 'No matching ticket found' },
          { status: 404 }
        );
      }

      const serialNumber = ticket.serial_number as number;
      const formattedSerial = `${ticket.queue_prefix}${String(serialNumber).padStart(3, '0')}`;

      // Calculate position and EWT if ticket is WAITING
      let position: number | undefined;
      let ewt: number | undefined;

      if (ticket.status === 'WAITING') {
        const waitingAhead = await getWaitingAhead(
          d1,
          queueId,
          serialNumber
        );
        position = waitingAhead + 1;

        const avgServiceTime = await getAvgServiceTime(
          d1,
          tenantId,
          queueId,
          queue.default_service_time_sec
        );
        ewt = (waitingAhead + 1) * avgServiceTime;
      }

      // Convert to camelCase and add extra fields
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(ticket)) {
        const camelKey = key.replace(
          /_([a-z])/g,
          (_: string, c: string) => c.toUpperCase()
        );
        result[camelKey] = ticket[key];
      }
      result.formattedSerial = formattedSerial;
      result.position = position;
      result.ewt = ewt;

      return NextResponse.json({ ticket: result });
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

// GET: Public ticket status check (by ticketId or phone + tenantId)
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
      return NextResponse.json(
        { error: 'Invalid dateFrom format' },
        { status: 400 }
      );
    }
    if (dateTo && isNaN(new Date(dateTo).getTime())) {
      return NextResponse.json(
        { error: 'Invalid dateTo format' },
        { status: 400 }
      );
    }

    if (!ticketId && (!phone || !tenantIdParam)) {
      return NextResponse.json(
        { error: 'Provide ticketId OR (phone + tenantId)' },
        { status: 400 }
      );
    }

    const d1 = await getD1FromEnv();

    // Rate limit
    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const rlKey = ticketId || phone || 'unknown';
    const { allowed, retryAfterMs } = await rateLimit(
      `status:${ip}:${rlKey}`,
      30,
      60_000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
          },
        }
      );
    }

    // Single ticket lookup
    if (ticketId) {
      // If tenantId is provided, scope lookup; otherwise look up globally
      let query = `SELECT t.id, t.tenant_id, t.queue_id, t.serial_number, t.status, t.customer_name, t.created_at,
                          q.name as queue_name, q.prefix as queue_prefix, q.default_service_time_sec as queue_default_service_time_sec
                   FROM tickets t
                   JOIN queues q ON t.queue_id = q.id
                   WHERE t.id = ?`;
      const binds: unknown[] = [ticketId];
      if (tenantIdParam) {
        query += ' AND t.tenant_id = ?';
        binds.push(tenantIdParam);
      }

      const ticket = await d1
        .prepare(query)
        .bind(...binds)
        .first<Record<string, unknown>>();

      if (!ticket) {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        );
      }

      const ticketTenantId = (ticket.tenant_id as string) || tenantIdParam;
      const serialNumber = ticket.serial_number as number;
      const waitingAhead = await getWaitingAhead(
        d1,
        ticket.queue_id as string,
        serialNumber
      );

      const avgServiceTime = await getAvgServiceTime(
        d1,
        ticketTenantId,
        ticket.queue_id as string,
        ticket.queue_default_service_time_sec as number
      );

      const ewt = (waitingAhead + 1) * avgServiceTime;
      const formattedSerial = `${ticket.queue_prefix}${String(serialNumber).padStart(3, '0')}`;

      return NextResponse.json({
        ticket: {
          id: ticket.id,
          tenantId: ticketTenantId,
          queueId: ticket.queue_id,
          serialNumber: ticket.serial_number,
          status: ticket.status,
          customerName: ticket.customer_name,
          _formattedSerial: formattedSerial,
          _peopleAhead: waitingAhead + 1,
          _ewt: ewt,
          queue: {
            name: ticket.queue_name,
            prefix: ticket.queue_prefix,
          },
        },
      });
    }

    // Phone+tenantId is required for list lookup
    if (!phone || !tenantIdParam) {
      return NextResponse.json(
        { error: 'tenantId is required with phone for list lookup' },
        { status: 400 }
      );
    }

    const tenantId = tenantIdParam;

    // Phone lookup with pagination and date filter
    let countSql =
      'SELECT count(*) as cnt FROM tickets WHERE customer_phone = ? AND tenant_id = ?';
    let dataSql = `SELECT t.id, t.queue_id, t.serial_number, t.status, t.created_at,
                          q.name as queue_name, q.prefix as queue_prefix, q.default_service_time_sec as queue_default_service_time_sec, q.tenant_id as queue_tenant_id
                   FROM tickets t
                   JOIN queues q ON t.queue_id = q.id
                   WHERE t.customer_phone = ? AND t.tenant_id = ?`;
    const countBinds: unknown[] = [phone, tenantId];
    const dataBinds: unknown[] = [phone, tenantId];

    if (dateFrom || dateTo) {
      if (dateFrom) {
        countSql += ' AND t.created_at >= ?';
        dataSql += ' AND t.created_at >= ?';
        countBinds.push(new Date(dateFrom).toISOString());
        dataBinds.push(new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        const d = new Date(dateTo);
        d.setHours(23, 59, 59, 999);
        countSql += ' AND t.created_at <= ?';
        dataSql += ' AND t.created_at <= ?';
        countBinds.push(d.toISOString());
        dataBinds.push(d.toISOString());
      }
    }

    dataSql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    dataBinds.push(limit, (page - 1) * limit);

    const [totalResult, ticketsResult] = await Promise.all([
      d1.prepare(countSql).bind(...countBinds).first<{ cnt: number }>(),
      d1.prepare(dataSql).bind(...dataBinds).all<Record<string, unknown>>(),
    ]);

    const total = totalResult?.cnt ?? 0;

    // Enrich with position and EWT for WAITING tickets
    const enriched = await Promise.all(
      ticketsResult.results.map(async (t) => {
        let position: number | undefined;
        let ewt: number | undefined;

        if (t.status === 'WAITING') {
          const waitingAhead = await getWaitingAhead(
            d1,
            t.queue_id as string,
            t.serial_number as number
          );
          position = waitingAhead + 1;

          const avgServiceTime = await getAvgServiceTime(
            d1,
            tenantId,
            t.queue_id as string,
            t.queue_default_service_time_sec as number
          );
          ewt = (waitingAhead + 1) * avgServiceTime;
        }

        const formattedSerial = `${t.queue_prefix}${String(t.serial_number).padStart(3, '0')}`;

        return {
          id: t.id,
          queueId: t.queue_id,
          serialNumber: t.serial_number,
          status: t.status,
          formattedSerial,
          position,
          ewt,
        };
      })
    );

    return NextResponse.json({
      tickets: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
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