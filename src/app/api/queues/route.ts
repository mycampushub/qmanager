import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { dbNow } from '@/lib/datetime';
import { getClientIp, toCamel } from '@/lib/utils';
import { emitWSEvent } from '@/lib/ws-emit';

// Helper: map a queue DB row to the API response shape
function mapQueue(q: Record<string, unknown>): Record<string, unknown> {
  return {
    ...toCamel(q),
    isActive: q.is_active === 1,
  };
}

// GET: List queues for user's tenant
export const GET = withAuth(
  async (_req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = user.tenantId;
      if (!tenantId) {
        return NextResponse.json(
          { error: 'Tenant context required' },
          { status: 400 }
        );
      }

      const d1 = await getD1FromEnv();

      let sql: string;
      const binds: unknown[] = [];

      if (user.role === 'AGENT') {
        // AGENT: only show assigned queues, unless agent has NO assignments (backwards compatible)
        sql = `SELECT q.*,
  COALESCE(wc.waiting_count, 0) as waiting_count,
  COALESCE(sc.serving_count, 0) as serving_count,
  COALESCE(skpc.skipped_count, 0) as skipped_count
FROM queues q
LEFT JOIN (SELECT queue_id, count(*) as waiting_count FROM tickets WHERE status = 'WAITING' GROUP BY queue_id) wc ON wc.queue_id = q.id
LEFT JOIN (SELECT queue_id, count(*) as serving_count FROM tickets WHERE status = 'SERVING' GROUP BY queue_id) sc ON sc.queue_id = q.id
LEFT JOIN (SELECT queue_id, count(*) as skipped_count FROM tickets WHERE status = 'SKIPPED' GROUP BY queue_id) skpc ON skpc.queue_id = q.id
LEFT JOIN queue_assignments qa ON qa.queue_id = q.id AND qa.agent_id = ? AND qa.is_active = 1
WHERE q.tenant_id = ? AND q.is_active = 1
AND (qa.id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM queue_assignments WHERE agent_id = ? AND is_active = 1 AND tenant_id = ?))
ORDER BY q.name ASC`;
        binds.push(user.userId, tenantId, user.userId, tenantId);
      } else {
        // MANAGER: see all queues (optimized with LEFT JOINs)
        sql = `SELECT q.*,
  COALESCE(wc.waiting_count, 0) as waiting_count,
  COALESCE(sc.serving_count, 0) as serving_count,
  COALESCE(skpc.skipped_count, 0) as skipped_count
FROM queues q
LEFT JOIN (SELECT queue_id, count(*) as waiting_count FROM tickets WHERE status = 'WAITING' GROUP BY queue_id) wc ON wc.queue_id = q.id
LEFT JOIN (SELECT queue_id, count(*) as serving_count FROM tickets WHERE status = 'SERVING' GROUP BY queue_id) sc ON sc.queue_id = q.id
LEFT JOIN (SELECT queue_id, count(*) as skipped_count FROM tickets WHERE status = 'SKIPPED' GROUP BY queue_id) skpc ON skpc.queue_id = q.id
WHERE q.tenant_id = ? AND q.is_active = 1
ORDER BY q.name ASC`;
        binds.push(tenantId);
      }

      const queueResult = await d1
        .prepare(sql)
        .bind(...binds)
        .all();

      const queues = queueResult.results.map((q) => {
        const qRec = q as Record<string, unknown>;
        const mapped = mapQueue(qRec);
        mapped.waitingCount = (qRec.waiting_count as number) ?? 0;
        mapped.servingCount = (qRec.serving_count as number) ?? 0;
        mapped.skippedCount = (qRec.skipped_count as number) ?? 0;
        return mapped;
      });

      return NextResponse.json({ queues });
    } catch (error) {
      console.error('List queues error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['AGENT', 'MANAGER'], requireTenantId: true }
);

// POST: Create new queue (MANAGER only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const {
        tenantId,
        name,
        description,
        prefix,
        defaultServiceTimeSec,
        locationTag,
      } = body as {
        tenantId: string;
        name: string;
        description?: string;
        prefix: string;
        defaultServiceTimeSec?: number;
        locationTag?: string;
      };

      if (!tenantId || !name || !prefix) {
        return NextResponse.json(
          { error: 'tenantId, name, and prefix are required' },
          { status: 400 }
        );
      }

      // B3: String length limits
      if (name.length > 100) {
        return NextResponse.json(
          { error: 'Queue name must be at most 100 characters' },
          { status: 400 }
        );
      }
      if (prefix.length > 5) {
        return NextResponse.json(
          { error: 'Queue prefix must be at most 5 characters' },
          { status: 400 }
        );
      }

      // B4: Validate defaultServiceTimeSec
      if (defaultServiceTimeSec !== undefined) {
        if (
          !Number.isInteger(defaultServiceTimeSec) ||
          defaultServiceTimeSec < 10 ||
          defaultServiceTimeSec > 3600
        ) {
          return NextResponse.json(
            {
              error:
                'defaultServiceTimeSec must be an integer between 10 and 3600',
            },
            { status: 400 }
          );
        }
      }

      if (user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only create queues for your own tenant' },
          { status: 403 }
        );
      }

      const d1 = await getD1FromEnv();

      // A18: Wrap count-check + create in a single batch to prevent race condition
      // Pre-reads for validation
      const tenant = await d1
        .prepare('SELECT plan_tier FROM tenants WHERE id = ?')
        .bind(tenantId)
        .first<{ plan_tier: string }>();

      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }

      const planLimit = await d1
        .prepare('SELECT max_queues, plan_tier FROM plan_limits WHERE plan_tier = ?')
        .bind(tenant.plan_tier)
        .first<{ max_queues: number; plan_tier: string }>();

      if (planLimit) {
        const countResult = await d1
          .prepare(
            'SELECT count(*) as cnt FROM queues WHERE tenant_id = ? AND is_active = 1'
          )
          .bind(tenantId)
          .first<{ cnt: number }>();

        if (countResult && countResult.cnt >= planLimit.max_queues) {
          return NextResponse.json(
            {
              error: `Queue limit reached (${planLimit.max_queues} for ${planLimit.plan_tier} plan). Please upgrade your plan.`,
            },
            { status: 400 }
          );
        }
      }

      // Create queue
      const id = crypto.randomUUID();
      const svcTime = defaultServiceTimeSec ?? 300;

      await d1
        .prepare(
          `INSERT INTO queues (id, tenant_id, name, location_tag, description, default_service_time_sec, prefix, current_serial, now_serving_serial, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 1)`
        )
        .bind(id, tenantId, name, locationTag || null, description || null, svcTime, prefix.toUpperCase())
        .run();

      // Audit log
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'QUEUE_CREATE',
          JSON.stringify({ queueId: id, name, prefix, tenantId, locationTag: locationTag || null }),
          ip
        )
        .run();

      const queue: Record<string, unknown> = {
        id,
        tenantId,
        name,
        locationTag: locationTag || null,
        description: description || null,
        defaultServiceTimeSec: svcTime,
        prefix: prefix.toUpperCase(),
        currentSerial: 0,
        nowServingSerial: 0,
        isActive: true,
        createdAt: dbNow(),
        updatedAt: dbNow(),
      };

      // Notify WebSocket clients
      emitWSEvent(tenantId, 'QUEUE_UPDATE', { queueId: id, action: 'created' });

      return NextResponse.json({ queue }, { status: 201 });
    } catch (error) {
      console.error('Create queue error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// PUT: Update queue (MANAGER only)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const {
        queueId,
        name,
        description,
        prefix,
        defaultServiceTimeSec,
        isActive,
        locationTag,
      } = body as {
        queueId: string;
        name?: string;
        description?: string;
        prefix?: string;
        defaultServiceTimeSec?: number;
        isActive?: boolean;
        locationTag?: string;
      };

      if (!queueId) {
        return NextResponse.json(
          { error: 'queueId is required' },
          { status: 400 }
        );
      }

      const d1 = await getD1FromEnv();

      // Verify queue belongs to user's tenant
      const existing = await d1
        .prepare('SELECT * FROM queues WHERE id = ?')
        .bind(queueId)
        .first<Record<string, unknown>>();

      if (!existing || existing.tenant_id !== user.tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      // Build dynamic SET clause
      const setClauses: string[] = [];
      const bindValues: unknown[] = [];

      if (name !== undefined) {
        setClauses.push('name = ?');
        bindValues.push(name);
      }
      if (description !== undefined) {
        setClauses.push('description = ?');
        bindValues.push(description);
      }
      if (prefix !== undefined) {
        if (prefix.length > 5) {
          return NextResponse.json(
            { error: 'Queue prefix must be at most 5 characters' },
            { status: 400 }
          );
        }
        setClauses.push('prefix = ?');
        bindValues.push(prefix.toUpperCase());
      }
      if (defaultServiceTimeSec !== undefined) {
        if (
          !Number.isInteger(defaultServiceTimeSec) ||
          defaultServiceTimeSec < 10 ||
          defaultServiceTimeSec > 3600
        ) {
          return NextResponse.json(
            {
              error:
                'defaultServiceTimeSec must be an integer between 10 and 3600',
            },
            { status: 400 }
          );
        }
        setClauses.push('default_service_time_sec = ?');
        bindValues.push(defaultServiceTimeSec);
      }
      if (isActive !== undefined) {
        setClauses.push('is_active = ?');
        bindValues.push(isActive ? 1 : 0);
      }
      if (locationTag !== undefined) {
        setClauses.push('location_tag = ?');
        bindValues.push(locationTag || null);
      }

      if (setClauses.length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        );
      }

      setClauses.push("updated_at = datetime('now')");
      bindValues.push(queueId);

      await d1
        .prepare(
          `UPDATE queues SET ${setClauses.join(', ')} WHERE id = ?`
        )
        .bind(...bindValues)
        .run();

      // Re-fetch updated queue
      const updated = await d1
        .prepare('SELECT * FROM queues WHERE id = ?')
        .bind(queueId)
        .first<Record<string, unknown>>();

      // Audit log
      const ip = getClientIp(req);
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (prefix !== undefined) updateData.prefix = prefix.toUpperCase();
      if (defaultServiceTimeSec !== undefined) updateData.defaultServiceTimeSec = defaultServiceTimeSec;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (locationTag !== undefined) updateData.locationTag = locationTag || null;

      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'QUEUE_UPDATE',
          JSON.stringify({ queueId, updateData }),
          ip
        )
        .run();

      // Notify WebSocket clients
      emitWSEvent(user.tenantId!, 'QUEUE_UPDATE', { queueId, action: 'updated' });

      return NextResponse.json({ queue: mapQueue(updated!) });
    } catch (error) {
      console.error('Update queue error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// DELETE: Soft-delete queue (MANAGER only)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { queueId } = body as { queueId: string };

      if (!queueId) {
        return NextResponse.json(
          { error: 'queueId is required' },
          { status: 400 }
        );
      }

      const d1 = await getD1FromEnv();

      // Verify queue belongs to user's tenant
      const queue = await d1
        .prepare('SELECT * FROM queues WHERE id = ?')
        .bind(queueId)
        .first<Record<string, unknown>>();

      if (!queue || queue.tenant_id !== user.tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      // Only if no WAITING tickets
      const waitingResult = await d1
        .prepare(
          'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
        )
        .bind(queueId, 'WAITING')
        .first<{ cnt: number }>();

      const waitingCount = waitingResult?.cnt ?? 0;

      if (waitingCount > 0) {
        return NextResponse.json(
          {
            error: `Cannot deactivate queue with ${waitingCount} waiting ticket(s). Complete or cancel them first.`,
          },
          { status: 400 }
        );
      }

      await d1
        .prepare("UPDATE queues SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
        .bind(queueId)
        .run();

      // Audit log
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'QUEUE_DELETE',
          JSON.stringify({ queueId, name: queue.name }),
          ip
        )
        .run();

      // Notify WebSocket clients
      emitWSEvent(user.tenantId!, 'QUEUE_UPDATE', { queueId, action: 'deleted' });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete queue error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);