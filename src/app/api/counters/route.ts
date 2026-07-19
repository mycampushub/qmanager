import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { dbNow } from '@/lib/datetime';
import { getClientIp, toCamel } from '@/lib/utils';
import { emitWSEvent } from '@/lib/ws-emit';

// GET: List counters for a queue
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = user.tenantId;
      if (!tenantId) {
        return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
      }

      const url = req.nextUrl;
      const queueId = url.searchParams.get('queueId');

      if (!queueId) {
        return NextResponse.json({ error: 'queueId is required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();

      // Verify queue belongs to tenant
      const queue = await d1
        .prepare('SELECT id FROM queues WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(queueId, tenantId)
        .first();
      if (!queue) {
        return NextResponse.json({ error: 'Queue not found or inactive' }, { status: 404 });
      }

      const result = await d1
        .prepare(
          `SELECT sc.*,
             t.id as _serving_ticket_id,
             t.serial_number as _serving_serial,
             t.customer_name as _serving_customer
           FROM service_counters sc
           LEFT JOIN tickets t ON t.counter_id = sc.id AND t.status = 'SERVING'
           WHERE sc.queue_id = ? AND sc.tenant_id = ? AND sc.is_active = 1
           ORDER BY sc.name ASC`
        )
        .bind(queueId, tenantId)
        .all<Record<string, unknown>>();

      const counters = result.results.map((row) => {
        const mapped = toCamel(row);
        mapped.isActive = row.is_active === 1;

        // Build _servingTicket if a serving ticket exists on this counter
        if (row._serving_ticket_id) {
          mapped._servingTicket = {
            id: row._serving_ticket_id,
            serialNumber: row._serving_serial,
            customerName: row._serving_customer,
            status: 'SERVING',
          };
        } else {
          mapped._servingTicket = null;
        }

        // Remove raw join fields
        delete mapped._servingTicketId;
        delete mapped._servingSerial;
        delete mapped._servingCustomer;

        return mapped;
      });

      return NextResponse.json({ counters });
    } catch (error) {
      console.error('List counters error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER', 'AGENT'], requireTenantId: true }
);

// POST: Create counter (MANAGER only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { queueId, name, description } = body as {
        queueId: string;
        name: string;
        description?: string;
      };

      if (!queueId || !name) {
        return NextResponse.json(
          { error: 'queueId and name are required' },
          { status: 400 }
        );
      }

      if (typeof name !== 'string' || name.trim().length === 0 || name.length > 50) {
        return NextResponse.json(
          { error: 'Counter name must be between 1 and 50 characters' },
          { status: 400 }
        );
      }

      const tenantId = user.tenantId!;
      const d1 = await getD1FromEnv();

      // Verify queue belongs to tenant
      const queue = await d1
        .prepare('SELECT id FROM queues WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(queueId, tenantId)
        .first();
      if (!queue) {
        return NextResponse.json({ error: 'Queue not found or inactive' }, { status: 404 });
      }

      // Check uniqueness per queue
      const existing = await d1
        .prepare('SELECT id FROM service_counters WHERE queue_id = ? AND name = ? AND is_active = 1')
        .bind(queueId, name.trim())
        .first();
      if (existing) {
        return NextResponse.json(
          { error: 'A counter with this name already exists in this queue' },
          { status: 409 }
        );
      }

      const id = crypto.randomUUID();
      const now = dbNow();

      await d1
        .prepare(
          `INSERT INTO service_counters (id, tenant_id, queue_id, name, description, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .bind(id, tenantId, queueId, name.trim(), description || null, now, now)
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
          'COUNTER_CREATE',
          JSON.stringify({ counterId: id, name: name.trim(), queueId, tenantId }),
          ip
        )
        .run();

      const counter = {
        id,
        tenantId,
        queueId,
        name: name.trim(),
        description: description || null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        _servingTicket: null,
      };

      emitWSEvent(tenantId, 'QUEUE_UPDATE', { counterId: id, queueId, action: 'created' });

      return NextResponse.json({ counter }, { status: 201 });
    } catch (error) {
      console.error('Create counter error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// PUT: Update counter (MANAGER only)
export const PUT = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { counterId, name, description, isActive } = body as {
        counterId: string;
        name?: string;
        description?: string;
        isActive?: boolean;
      };

      if (!counterId) {
        return NextResponse.json({ error: 'counterId is required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();

      // Verify counter belongs to tenant
      const existing = await d1
        .prepare('SELECT * FROM service_counters WHERE id = ? AND tenant_id = ?')
        .bind(counterId, user.tenantId)
        .first<Record<string, unknown>>();

      if (!existing) {
        return NextResponse.json({ error: 'Counter not found' }, { status: 404 });
      }

      // Build dynamic SET clause
      const setClauses: string[] = [];
      const bindValues: unknown[] = [];

      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0 || name.length > 50) {
          return NextResponse.json(
            { error: 'Counter name must be between 1 and 50 characters' },
            { status: 400 }
          );
        }
        // Check uniqueness
        const dup = await d1
          .prepare('SELECT id FROM service_counters WHERE queue_id = ? AND name = ? AND is_active = 1 AND id != ?')
          .bind(existing.queue_id, name.trim(), counterId)
          .first();
        if (dup) {
          return NextResponse.json(
            { error: 'A counter with this name already exists in this queue' },
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
      if (isActive !== undefined) {
        setClauses.push('is_active = ?');
        bindValues.push(isActive ? 1 : 0);
      }

      if (setClauses.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      setClauses.push("updated_at = datetime('now')");
      bindValues.push(counterId);

      await d1
        .prepare(`UPDATE service_counters SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...bindValues)
        .run();

      // Audit log
      const ip = getClientIp(req);
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description;
      if (isActive !== undefined) updateData.isActive = isActive;

      await d1
        .prepare(
          `INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          user.userId,
          user.type,
          'COUNTER_UPDATE',
          JSON.stringify({ counterId, queueId: existing.queue_id, updateData }),
          ip
        )
        .run();

      emitWSEvent(user.tenantId!, 'QUEUE_UPDATE', {
        counterId,
        queueId: existing.queue_id,
        action: 'updated',
      });

      // Re-fetch
      const updated = await d1
        .prepare('SELECT * FROM service_counters WHERE id = ?')
        .bind(counterId)
        .first<Record<string, unknown>>();

      const mapped = toCamel(updated!);
      mapped.isActive = updated!.is_active === 1;

      return NextResponse.json({ counter: mapped });
    } catch (error) {
      console.error('Update counter error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// DELETE: Soft-delete counter (MANAGER only)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { counterId } = body as { counterId: string };

      if (!counterId) {
        return NextResponse.json({ error: 'counterId is required' }, { status: 400 });
      }

      const d1 = await getD1FromEnv();

      // Verify counter belongs to tenant
      const counter = await d1
        .prepare('SELECT * FROM service_counters WHERE id = ? AND tenant_id = ?')
        .bind(counterId, user.tenantId)
        .first<Record<string, unknown>>();

      if (!counter) {
        return NextResponse.json({ error: 'Counter not found' }, { status: 404 });
      }

      // Check for SERVING ticket on this counter
      const servingTicket = await d1
        .prepare('SELECT id FROM tickets WHERE counter_id = ? AND status = ? LIMIT 1')
        .bind(counterId, 'SERVING')
        .first();

      if (servingTicket) {
        return NextResponse.json(
          { error: 'Cannot delete counter with an active serving ticket. Complete the ticket first.' },
          { status: 400 }
        );
      }

      await d1
        .prepare("UPDATE service_counters SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
        .bind(counterId)
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
          'COUNTER_DELETE',
          JSON.stringify({ counterId, name: counter.name, queueId: counter.queue_id }),
          ip
        )
        .run();

      emitWSEvent(user.tenantId!, 'QUEUE_UPDATE', {
        counterId,
        queueId: counter.queue_id,
        action: 'deleted',
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete counter error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);