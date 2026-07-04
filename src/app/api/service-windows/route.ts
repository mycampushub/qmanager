import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { dbNow } from '@/lib/datetime';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ─── Validation helpers ─────────────────────────────────────────

function validateServiceWindowBody(body: Record<string, unknown>): string | null {
  const { dayOfWeek, openTime, closeTime } = body;

  if (dayOfWeek === undefined || typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
    return 'dayOfWeek must be an integer 0-6 (Sunday=0)';
  }

  if (typeof openTime !== 'string' || !TIME_REGEX.test(openTime)) {
    return 'openTime must be in HH:mm format (00:00–23:59)';
  }

  if (typeof closeTime !== 'string' || !TIME_REGEX.test(closeTime)) {
    return 'closeTime must be in HH:mm format (00:00–23:59)';
  }

  if (!body.isClosed && openTime >= closeTime) {
    return 'openTime must be before closeTime';
  }

  return null;
}

interface ServiceWindowRow {
  id: string;
  tenant_id: string;
  queue_id: string | null;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  _qid: string | null;
  _qname: string | null;
  _qprefix: string | null;
}

function mapWindowRow(r: ServiceWindowRow) {
  const obj: Record<string, unknown> = {
    id: r.id,
    tenantId: r.tenant_id,
    dayOfWeek: r.day_of_week,
    openTime: r.open_time,
    closeTime: r.close_time,
    isClosed: r.is_closed === 1,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (r.queue_id) {
    obj.queueId = r.queue_id;
    obj.queue = { id: r._qid, name: r._qname, prefix: r._qprefix };
  }
  return obj;
}

// ─── GET: List service windows ──────────────────────────────────

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const queueId = req.nextUrl.searchParams.get('queueId');

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant data' },
          { status: 403 }
        );
      }

      let sql = `
        SELECT sw.id, sw.tenant_id, sw.queue_id, sw.day_of_week, sw.open_time, sw.close_time,
               sw.is_closed, sw.is_active, sw.created_at, sw.updated_at,
               q.id as _qid, q.name as _qname, q.prefix as _qprefix
        FROM service_windows sw
        LEFT JOIN queues q ON sw.queue_id = q.id
        WHERE sw.tenant_id = ? AND sw.is_active = 1
      `;
      const binds: unknown[] = [tenantId];

      if (queueId) {
        sql += ' AND sw.queue_id = ?';
        binds.push(queueId);
      }

      sql += ' ORDER BY sw.day_of_week ASC, sw.open_time ASC';

      const result = await d1.prepare(sql).bind(...binds).all<ServiceWindowRow>();

      return NextResponse.json({ serviceWindows: result.results.map(mapWindowRow) });
    } catch (error) {
      console.error('List service windows error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);

// ─── POST: Create service window ────────────────────────────────

export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { tenantId, queueId, dayOfWeek, openTime, closeTime, isClosed } = body as {
        tenantId?: string;
        queueId?: string;
        dayOfWeek: number;
        openTime: string;
        closeTime: string;
        isClosed?: boolean;
      };

      const effectiveTenantId = tenantId || user.tenantId;
      if (!effectiveTenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== effectiveTenantId) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      const validationError = validateServiceWindowBody(body);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      // Check for duplicate day+queue combination
      const dupBinds: unknown[] = [effectiveTenantId, dayOfWeek];
      let dupSql = 'SELECT id FROM service_windows WHERE tenant_id = ? AND day_of_week = ? AND is_active = 1';
      if (queueId) {
        dupSql += ' AND queue_id = ?';
        dupBinds.push(queueId);
      } else {
        dupSql += ' AND queue_id IS NULL';
      }

      const existing = await d1.prepare(dupSql).bind(...dupBinds).first<{ id: string }>();
      if (existing) {
        return NextResponse.json(
          { error: 'A service window already exists for this day and queue' },
          { status: 409 }
        );
      }

      // If queueId provided, verify it belongs to the tenant
      if (queueId) {
        const queue = await d1
          .prepare('SELECT id, tenant_id FROM queues WHERE id = ?')
          .bind(queueId)
          .first<{ id: string; tenant_id: string }>();
        if (!queue || queue.tenant_id !== effectiveTenantId) {
          return NextResponse.json(
            { error: 'Queue not found or does not belong to this tenant' },
            { status: 400 }
          );
        }
      }

      const newId = crypto.randomUUID();

      await d1.prepare(
        `INSERT INTO service_windows (id, tenant_id, queue_id, day_of_week, open_time, close_time, is_closed, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(newId, effectiveTenantId, queueId || null, dayOfWeek, openTime, closeTime, isClosed ? 1 : 0).run();

      // Fetch created window with queue info
      const created = await d1.prepare(
        `SELECT sw.id, sw.tenant_id, sw.queue_id, sw.day_of_week, sw.open_time, sw.close_time,
                sw.is_closed, sw.is_active, sw.created_at, sw.updated_at,
                q.id as _qid, q.name as _qname, q.prefix as _qprefix
         FROM service_windows sw
         LEFT JOIN queues q ON sw.queue_id = q.id
         WHERE sw.id = ?`
      ).bind(newId).first<ServiceWindowRow>();

      return NextResponse.json({ serviceWindow: mapWindowRow(created!) }, { status: 201 });
    } catch (error) {
      console.error('Create service window error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'] }
);

// ─── PUT: Update service window ─────────────────────────────────

export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { id, dayOfWeek, openTime, closeTime, isClosed, queueId } = body as {
        id: string;
        dayOfWeek?: number;
        openTime?: string;
        closeTime?: string;
        isClosed?: boolean;
        queueId?: string | null;
      };

      if (!id) {
        return NextResponse.json({ error: 'id is required' }, { status: 400 });
      }

      const existing = await d1
        .prepare('SELECT id, tenant_id, day_of_week, open_time, close_time, is_closed, is_active, queue_id FROM service_windows WHERE id = ?')
        .bind(id)
        .first<{ id: string; tenant_id: string; day_of_week: number; open_time: string; close_time: string; is_closed: number; is_active: number; queue_id: string | null }>();

      if (!existing || existing.is_active !== 1) {
        return NextResponse.json({ error: 'Service window not found' }, { status: 404 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== existing.tenant_id) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      const setClauses: string[] = [];
      const values: unknown[] = [];

      if (dayOfWeek !== undefined) {
        if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
          return NextResponse.json({ error: 'dayOfWeek must be an integer 0-6' }, { status: 400 });
        }
        setClauses.push('day_of_week = ?');
        values.push(dayOfWeek);
      }

      if (openTime !== undefined) {
        if (typeof openTime !== 'string' || !TIME_REGEX.test(openTime)) {
          return NextResponse.json({ error: 'openTime must be in HH:mm format' }, { status: 400 });
        }
        setClauses.push('open_time = ?');
        values.push(openTime);
      }

      if (closeTime !== undefined) {
        if (typeof closeTime !== 'string' || !TIME_REGEX.test(closeTime)) {
          return NextResponse.json({ error: 'closeTime must be in HH:mm format' }, { status: 400 });
        }
        setClauses.push('close_time = ?');
        values.push(closeTime);
      }

      // Validate open < close
      const effectiveOpen = openTime ?? existing.open_time;
      const effectiveClose = closeTime ?? existing.close_time;
      const effectiveIsClosed = isClosed !== undefined ? isClosed : existing.is_closed === 1;
      if (!effectiveIsClosed && effectiveOpen >= effectiveClose) {
        return NextResponse.json({ error: 'openTime must be before closeTime' }, { status: 400 });
      }

      if (isClosed !== undefined) {
        setClauses.push('is_closed = ?');
        values.push(isClosed ? 1 : 0);
      }

      if (queueId !== undefined) {
        if (queueId) {
          const queue = await d1
            .prepare('SELECT id, tenant_id FROM queues WHERE id = ?')
            .bind(queueId)
            .first<{ id: string; tenant_id: string }>();
          if (!queue || queue.tenant_id !== existing.tenant_id) {
            return NextResponse.json(
              { error: 'Queue not found or does not belong to this tenant' },
              { status: 400 }
            );
          }
        }
        setClauses.push('queue_id = ?');
        values.push(queueId);
      }

      // Check duplicate day+queue if day or queue changed
      if (dayOfWeek !== undefined || queueId !== undefined) {
        const checkDay = dayOfWeek ?? existing.day_of_week;
        const checkQueue = queueId !== undefined ? queueId : existing.queue_id;
        let dupSql = 'SELECT id FROM service_windows WHERE tenant_id = ? AND day_of_week = ? AND is_active = 1 AND id != ?';
        const dupBinds: unknown[] = [existing.tenant_id, checkDay, id];
        if (checkQueue) {
          dupSql += ' AND queue_id = ?';
          dupBinds.push(checkQueue);
        } else {
          dupSql += ' AND queue_id IS NULL';
        }
        const duplicate = await d1.prepare(dupSql).bind(...dupBinds).first<{ id: string }>();
        if (duplicate) {
          return NextResponse.json(
            { error: 'A service window already exists for this day and queue' },
            { status: 409 }
          );
        }
      }

      if (setClauses.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      setClauses.push("updated_at = datetime('now')");
      values.push(id); // WHERE id = ?

      await d1
        .prepare(`UPDATE service_windows SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run();

      // Fetch updated record
      const updated = await d1.prepare(
        `SELECT sw.id, sw.tenant_id, sw.queue_id, sw.day_of_week, sw.open_time, sw.close_time,
                sw.is_closed, sw.is_active, sw.created_at, sw.updated_at,
                q.id as _qid, q.name as _qname, q.prefix as _qprefix
         FROM service_windows sw
         LEFT JOIN queues q ON sw.queue_id = q.id
         WHERE sw.id = ?`
      ).bind(id).first<ServiceWindowRow>();

      return NextResponse.json({ serviceWindow: mapWindowRow(updated!) });
    } catch (error) {
      console.error('Update service window error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'] }
);

// ─── DELETE: Soft-delete service window ─────────────────────────

export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const id = req.nextUrl.searchParams.get('id');
      if (!id) {
        return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
      }

      const existing = await d1
        .prepare('SELECT id, tenant_id, is_active FROM service_windows WHERE id = ?')
        .bind(id)
        .first<{ id: string; tenant_id: string; is_active: number }>();

      if (!existing || existing.is_active !== 1) {
        return NextResponse.json({ error: 'Service window not found' }, { status: 404 });
      }

      if (user.role === 'MANAGER' && user.tenantId !== existing.tenant_id) {
        return NextResponse.json(
          { error: 'You can only manage your own tenant' },
          { status: 403 }
        );
      }

      await d1
        .prepare("UPDATE service_windows SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
        .bind(id)
        .run();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete service window error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'] }
);