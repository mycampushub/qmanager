import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { dbNow } from '@/lib/datetime';
import { toCamel } from '@/lib/utils';
import { emitWSEvent } from '@/lib/ws-emit';

const VALID_LEVELS = ['ROOM', 'LINE', 'COUNTER'] as const;

// GET: List active breaks for tenant (MANAGER/AGENT)
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = user.tenantId;
      if (!tenantId) {
        return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();
      const url = req.nextUrl;
      const levelFilter = url.searchParams.get('level');
      const queueIdFilter = url.searchParams.get('queueId');

      // Auto-end expired breaks (lazy evaluation)
      await d1
        .prepare(
          `UPDATE break_periods
           SET is_active = 0, ended_at = datetime('now')
           WHERE tenant_id = ?
             AND is_active = 1
             AND ends_at IS NOT NULL
             AND ends_at < datetime('now')`
        )
        .bind(tenantId)
        .run();

      // Build query
      const conditions: string[] = ['bp.tenant_id = ?'];
      const binds: unknown[] = [tenantId];

      if (levelFilter && VALID_LEVELS.includes(levelFilter as typeof VALID_LEVELS[number])) {
        conditions.push('bp.level = ?');
        binds.push(levelFilter);
      }

      if (queueIdFilter) {
        conditions.push('(bp.queue_id = ? OR bp.level = ?)');
        binds.push(queueIdFilter, 'ROOM');
      }

      const result = await d1
        .prepare(
          `SELECT bp.*,
             q.name as _queue_name,
             sc.name as _counter_name,
             u.name as _ended_by_name
           FROM break_periods bp
           LEFT JOIN queues q ON q.id = bp.queue_id
           LEFT JOIN service_counters sc ON sc.id = bp.counter_id
           LEFT JOIN users u ON u.id = bp.ended_by
           WHERE ${conditions.join(' AND ')}
           ORDER BY bp.started_at DESC`
        )
        .bind(...binds)
        .all<Record<string, unknown>>();

      const breaks = result.results.map((row) => {
        const mapped = toCamel(row);
        mapped.isActive = row.is_active === 1;
        mapped._queueName = row._queue_name || null;
        mapped._counterName = row._counter_name || null;
        mapped._endedByName = row._ended_by_name || null;
        return mapped;
      });

      return NextResponse.json({ breaks });
    } catch (error) {
      console.error('List breaks error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'AGENT'], requireTenantId: true }
);

// POST: Start a break (MANAGER/AGENT)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { level, queueId, counterId, reason, endsAt } = body as {
        level: string;
        queueId?: string;
        counterId?: string;
        reason?: string;
        endsAt?: string;
      };

      if (!level) {
        return NextResponse.json({ error: 'level is required' }, { status: 400 });
      }

      if (!VALID_LEVELS.includes(level as typeof VALID_LEVELS[number])) {
        return NextResponse.json(
          { error: `level must be one of: ${VALID_LEVELS.join(', ')}` },
          { status: 400 }
        );
      }

      const tenantId = user.tenantId!;
      const d1 = await getD1FromEnv();

      // Validate queueId if level is LINE or COUNTER
      if ((level === 'LINE' || level === 'COUNTER') && !queueId) {
        return NextResponse.json(
          { error: `queueId is required for ${level} level breaks` },
          { status: 400 }
        );
      }

      // Validate counterId if level is COUNTER
      if (level === 'COUNTER' && !counterId) {
        return NextResponse.json(
          { error: 'counterId is required for COUNTER level breaks' },
          { status: 400 }
        );
      }

      // Verify queue exists and belongs to tenant (if provided)
      if (queueId) {
        const queue = await d1
          .prepare('SELECT id FROM queues WHERE id = ? AND tenant_id = ? AND is_active = 1')
          .bind(queueId, tenantId)
          .first();
        if (!queue) {
          return NextResponse.json({ error: 'Queue not found or inactive' }, { status: 404 });
        }
      }

      // Verify counter exists and belongs to tenant (if provided)
      if (counterId) {
        let counterSql = 'SELECT id FROM service_counters WHERE id = ? AND tenant_id = ? AND is_active = 1';
        const counterBinds: unknown[] = [counterId, tenantId];
        if (queueId) {
          counterSql += ' AND queue_id = ?';
          counterBinds.push(queueId);
        }
        const counter = await d1.prepare(counterSql).bind(...counterBinds).first();
        if (!counter) {
          return NextResponse.json({ error: 'Counter not found or inactive' }, { status: 404 });
        }
      }

      const id = crypto.randomUUID();
      const now = dbNow();

      await d1
        .prepare(
          `INSERT INTO break_periods (id, tenant_id, level, queue_id, counter_id, reason, started_at, ends_at, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .bind(id, tenantId, level, queueId || null, counterId || null, reason || null, now, endsAt || null, now)
        .run();

      const breakPeriod = {
        id,
        tenantId,
        level,
        queueId: queueId || null,
        counterId: counterId || null,
        reason: reason || null,
        startedAt: now,
        endsAt: endsAt || null,
        endedAt: null,
        endedBy: null,
        isActive: true,
        createdAt: now,
        _queueName: null,
        _counterName: null,
        _endedByName: null,
      };

      emitWSEvent(tenantId, 'BREAK_STARTED', {
        breakId: id,
        level,
        queueId: queueId || null,
        counterId: counterId || null,
        reason: reason || null,
      });

      return NextResponse.json({ break: breakPeriod }, { status: 201 });
    } catch (error) {
      console.error('Start break error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'AGENT'], requireTenantId: true }
);

// PUT: End a break (set is_active=0, ended_at=now, ended_by=userId)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { breakId } = body as { breakId: string };

      if (!breakId) {
        return NextResponse.json({ error: 'breakId is required' }, { status: 400 });
      }

      const tenantId = user.tenantId!;
      const d1 = await getD1FromEnv();
      const now = dbNow();

      // Verify break belongs to tenant and is active
      const existing = await d1
        .prepare('SELECT * FROM break_periods WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(breakId, tenantId)
        .first<Record<string, unknown>>();

      if (!existing) {
        return NextResponse.json(
          { error: 'Active break not found' },
          { status: 404 }
        );
      }

      await d1
        .prepare(
          `UPDATE break_periods
           SET is_active = 0, ended_at = ?, ended_by = ?
           WHERE id = ? AND is_active = 1`
        )
        .bind(now, user.userId, breakId)
        .run();

      emitWSEvent(tenantId, 'BREAK_ENDED', {
        breakId,
        level: existing.level,
        queueId: existing.queue_id || null,
        counterId: existing.counter_id || null,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('End break error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'AGENT'], requireTenantId: true }
);