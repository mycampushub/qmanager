import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';

// Helper: convert snake_case DB row to camelCase
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    result[camelKey] = row[key];
  }
  return result;
}

// Helper: map a queue DB row to the API response shape
function mapQueue(q: Record<string, unknown>): Record<string, unknown> {
  return {
    ...toCamel(q),
    isActive: q.is_active === 1,
  };
}

// Helper: get client IP
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
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

      const queueResult = await d1
        .prepare(
          'SELECT * FROM queues WHERE tenant_id = ? AND is_active = 1 ORDER BY name ASC'
        )
        .bind(tenantId)
        .all();

      const queues = await Promise.all(
        queueResult.results.map(async (q) => {
          const qRec = q as Record<string, unknown>;
          const [waitingResult, servingResult] = await Promise.all([
            d1
              .prepare(
                'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
              )
              .bind(qRec.id, 'WAITING')
              .first<{ cnt: number }>(),
            d1
              .prepare(
                'SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = ?'
              )
              .bind(qRec.id, 'SERVING')
              .first<{ cnt: number }>(),
          ]);

          const mapped = mapQueue(qRec);
          mapped.waitingCount = waitingResult?.cnt ?? 0;
          mapped.servingCount = servingResult?.cnt ?? 0;
          return mapped;
        })
      );

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
      } = body as {
        tenantId: string;
        name: string;
        description?: string;
        prefix: string;
        defaultServiceTimeSec?: number;
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
      const now = new Date().toISOString();
      const svcTime = defaultServiceTimeSec ?? 300;

      await d1
        .prepare(
          `INSERT INTO queues (id, tenant_id, name, description, default_service_time_sec, prefix, current_serial, now_serving_serial, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`
        )
        .bind(id, tenantId, name, description || null, svcTime, prefix.toUpperCase(), now, now)
        .run();

      // Audit log
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'QUEUE_CREATE',
          JSON.stringify({ queueId: id, name, prefix, tenantId }),
          ip,
          now
        )
        .run();

      const queue: Record<string, unknown> = {
        id,
        tenantId,
        name,
        description: description || null,
        defaultServiceTimeSec: svcTime,
        prefix: prefix.toUpperCase(),
        currentSerial: 0,
        nowServingSerial: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

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
      } = body as {
        queueId: string;
        name?: string;
        description?: string;
        prefix?: string;
        defaultServiceTimeSec?: number;
        isActive?: boolean;
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

      if (setClauses.length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        );
      }

      setClauses.push('updated_at = ?');
      bindValues.push(new Date().toISOString());
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

      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'QUEUE_UPDATE',
          JSON.stringify({ queueId, updateData }),
          ip,
          new Date().toISOString()
        )
        .run();

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

      const now = new Date().toISOString();
      await d1
        .prepare('UPDATE queues SET is_active = 0, updated_at = ? WHERE id = ?')
        .bind(now, queueId)
        .run();

      // Audit log
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'QUEUE_DELETE',
          JSON.stringify({ queueId, name: queue.name }),
          ip,
          now
        )
        .run();

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