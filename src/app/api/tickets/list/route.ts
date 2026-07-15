import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { toCamel } from '@/lib/utils';

// POST: List tickets for a queue by status (authed, for AgentView)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const body = await req.json();
      const { queueId, status, limit = 20, cursor } = body as {
        queueId: string;
        status?: string;
        limit?: number;
        cursor?: number;
      };

      if (!queueId) {
        return NextResponse.json(
          { error: 'queueId is required' },
          { status: 400 }
        );
      }

      const tenantId = user.tenantId!;
      const d1 = await getD1FromEnv();

      // Verify queue belongs to tenant
      const queue = await d1
        .prepare('SELECT id, tenant_id, prefix FROM queues WHERE id = ?')
        .bind(queueId)
        .first<{ id: string; tenant_id: string; prefix: string }>();

      if (!queue || queue.tenant_id !== tenantId) {
        return NextResponse.json(
          { error: 'Queue not found' },
          { status: 404 }
        );
      }

      const VALID_STATUSES = ['WAITING', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED'];
      const statusFilter = VALID_STATUSES.includes(status ?? '') ? (status ?? '') : null;

      let sql = `SELECT t.* FROM tickets t WHERE t.queue_id = ? AND t.tenant_id = ?`;
      const bindValues: unknown[] = [queueId, tenantId];

      if (statusFilter) {
        sql += ' AND t.status = ?';
        bindValues.push(statusFilter);
      }

      // Cursor-based pagination
      if (statusFilter === 'WAITING') {
        if (cursor) {
          sql += ' AND t.serial_number > ?';
          bindValues.push(cursor);
        }
        sql += ' ORDER BY t.serial_number ASC';
      } else {
        sql += ' ORDER BY t.created_at DESC';
        if (cursor) {
          sql += ' AND t.created_at < (SELECT created_at FROM tickets WHERE serial_number = ?)';
          bindValues.push(cursor);
        }
      }

      // Fetch limit+1 to detect hasMore
      const effectiveLimit = Math.min(limit, 50);
      sql += ' LIMIT ?';
      bindValues.push(effectiveLimit + 1);

      const result = await d1
        .prepare(sql)
        .bind(...bindValues)
        .all<Record<string, unknown>>();

      const hasMore = result.results.length > effectiveLimit;
      const rows = hasMore ? result.results.slice(0, effectiveLimit) : result.results;

      // Convert to camelCase + add formattedSerial
      const tickets = rows.map((row) => {
        const ticket = toCamel(row);
        ticket.formattedSerial = `${queue.prefix}${String(row.serial_number as number).padStart(3, '0')}`;
        return ticket;
      });

      return NextResponse.json({ tickets, hasMore });
    } catch (error) {
      console.error('Ticket list error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'AGENT'], requireTenantId: true }
);