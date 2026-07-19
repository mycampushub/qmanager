import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { dbNow } from '@/lib/datetime';
import { getClientIp, toCamel } from '@/lib/utils';
import { emitWSEvent } from '@/lib/ws-emit';

// GET: List locations for tenant (MANAGER/AGENT)
export const GET = withAuth(
  async (_req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = user.tenantId;
      if (!tenantId) {
        return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();

      const result = await d1
        .prepare(
          `SELECT l.*,
             COALESCE(qc.queue_count, 0) as _queue_count
           FROM locations l
           LEFT JOIN (
             SELECT location_id, count(*) as queue_count
             FROM queues
             WHERE tenant_id = ? AND is_active = 1
             GROUP BY location_id
           ) qc ON qc.location_id = l.id
           WHERE l.tenant_id = ? AND l.is_active = 1
           ORDER BY l.sort_order ASC, l.name ASC`
        )
        .bind(tenantId, tenantId)
        .all<Record<string, unknown>>();

      const locations = result.results.map((row) => {
        const mapped = toCamel(row);
        mapped.isActive = row.is_active === 1;
        mapped._queueCount = (row._queue_count as number) ?? 0;
        return mapped;
      });

      return NextResponse.json({ locations });
    } catch (error) {
      console.error('List locations error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'AGENT'], requireTenantId: true }
);

// POST: Create location (MANAGER only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { name, description, sortOrder } = body as {
        name: string;
        description?: string;
        sortOrder?: number;
      };

      if (!name) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
      }

      if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
        return NextResponse.json(
          { error: 'Location name must be between 1 and 100 characters' },
          { status: 400 }
        );
      }

      const tenantId = user.tenantId!;

      const d1 = await getD1FromEnv();

      // Check uniqueness per tenant
      const existing = await d1
        .prepare('SELECT id FROM locations WHERE tenant_id = ? AND name = ? AND is_active = 1')
        .bind(tenantId, name.trim())
        .first();

      if (existing) {
        return NextResponse.json(
          { error: 'A location with this name already exists' },
          { status: 409 }
        );
      }

      const id = crypto.randomUUID();
      const now = dbNow();

      await d1
        .prepare(
          `INSERT INTO locations (id, tenant_id, name, description, sort_order, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .bind(id, tenantId, name.trim(), description || null, sortOrder ?? 0, now, now)
        .run();

      // Audit log
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'LOCATION_CREATE',
          JSON.stringify({ locationId: id, name: name.trim(), tenantId }),
          ip
        )
        .run();

      const location = {
        id,
        tenantId,
        name: name.trim(),
        description: description || null,
        sortOrder: sortOrder ?? 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        _queueCount: 0,
      };

      emitWSEvent(tenantId, 'QUEUE_UPDATE', { locationId: id, action: 'created' });

      return NextResponse.json({ location }, { status: 201 });
    } catch (error) {
      console.error('Create location error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// PUT: Update location (MANAGER only)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { locationId, name, description, sortOrder, isActive } = body as {
        locationId: string;
        name?: string;
        description?: string;
        sortOrder?: number;
        isActive?: boolean;
      };

      if (!locationId) {
        return NextResponse.json({ error: 'locationId is required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();

      // Verify location belongs to tenant
      const existing = await d1
        .prepare('SELECT * FROM locations WHERE id = ? AND tenant_id = ?')
        .bind(locationId, user.tenantId)
        .first<Record<string, unknown>>();

      if (!existing) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 });
      }

      // Build dynamic SET clause
      const setClauses: string[] = [];
      const bindValues: unknown[] = [];

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
          return NextResponse.json(
            { error: 'Location name must be between 1 and 100 characters' },
            { status: 400 }
          );
        }
        // Check uniqueness
        const dup = await d1
          .prepare('SELECT id FROM locations WHERE tenant_id = ? AND name = ? AND is_active = 1 AND id != ?')
          .bind(user.tenantId, name.trim(), locationId)
          .first();
        if (dup) {
          return NextResponse.json(
            { error: 'A location with this name already exists' },
            { status: 409 }
          );
        }
        setClauses.push('name = ?');
        bindValues.push(name.trim());
      }
      if (description !== undefined) {
        setClauses.push('description = ?');
        bindValues.push(description);
      }
      if (sortOrder !== undefined) {
        setClauses.push('sort_order = ?');
        bindValues.push(sortOrder);
      }
      if (isActive !== undefined) {
        setClauses.push('is_active = ?');
        bindValues.push(isActive ? 1 : 0);
      }

      if (setClauses.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      setClauses.push("updated_at = datetime('now')");
      bindValues.push(locationId);

      await d1
        .prepare(`UPDATE locations SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...bindValues)
        .run();

      // Audit log
      const ip = getClientIp(req);
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (isActive !== undefined) updateData.isActive = isActive;

      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'LOCATION_UPDATE',
          JSON.stringify({ locationId, updateData }),
          ip
        )
        .run();

      // Re-fetch
      const updated = await d1
        .prepare(
          `SELECT l.*, COALESCE(qc.queue_count, 0) as _queue_count
           FROM locations l
           LEFT JOIN (SELECT location_id, count(*) as queue_count FROM queues WHERE tenant_id = ? AND is_active = 1 GROUP BY location_id) qc ON qc.location_id = l.id
           WHERE l.id = ?`
        )
        .bind(user.tenantId, locationId)
        .first<Record<string, unknown>>();

      const mapped = toCamel(updated!);
      mapped.isActive = updated!.is_active === 1;
      mapped._queueCount = (updated!._queue_count as number) ?? 0;

      emitWSEvent(user.tenantId!, 'QUEUE_UPDATE', { locationId, action: 'updated' });

      return NextResponse.json({ location: mapped });
    } catch (error) {
      console.error('Update location error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// DELETE: Soft-delete location (MANAGER only)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { locationId } = body as { locationId: string };

      if (!locationId) {
        return NextResponse.json({ error: 'locationId is required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();

      // Verify location belongs to tenant
      const location = await d1
        .prepare('SELECT * FROM locations WHERE id = ? AND tenant_id = ?')
        .bind(locationId, user.tenantId)
        .first<Record<string, unknown>>();

      if (!location) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 });
      }

      // Check for active queues in this location
      const queueCount = await d1
        .prepare('SELECT count(*) as cnt FROM queues WHERE location_id = ? AND is_active = 1')
        .bind(locationId)
        .first<{ cnt: number }>();

      if (queueCount && queueCount.cnt > 0) {
        return NextResponse.json(
          { error: `Cannot delete location with ${queueCount.cnt} active queue(s). Remove or reassign them first.` },
          { status: 400 }
        );
      }

      await d1
        .prepare("UPDATE locations SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
        .bind(locationId)
        .run();

      // Audit log
      const ip = getClientIp(req);
      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'LOCATION_DELETE',
          JSON.stringify({ locationId, name: location.name }),
          ip
        )
        .run();

      emitWSEvent(user.tenantId!, 'QUEUE_UPDATE', { locationId, action: 'deleted' });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete location error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);