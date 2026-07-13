import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type JwtPayload } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import { dbNow } from '@/lib/datetime';
import { getClientIp } from '@/lib/utils';

// GET: List queue assignments (MANAGER only)
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const agentIdParam = req.nextUrl.searchParams.get('agentId');

      let results: Record<string, unknown>[];

      if (agentIdParam) {
        // Filter by specific agent — verify agent belongs to same tenant
        const agent = await d1
          .prepare('SELECT id, tenant_id FROM users WHERE id = ? AND is_active = 1')
          .bind(agentIdParam)
          .first<{ id: string; tenant_id: string }>();

        if (!agent || agent.tenant_id !== user.tenantId) {
          return NextResponse.json(
            { error: 'Agent not found or not in your tenant' },
            { status: 404 }
          );
        }

        const result = await d1
          .prepare(
            `SELECT qa.id, qa.is_active, qa.created_at,
                    u.id as agent_id, u.name as agent_name, u.email as agent_email,
                    q.id as queue_id, q.name as queue_name, q.prefix as queue_prefix
             FROM queue_assignments qa
             JOIN users u ON u.id = qa.agent_id
             JOIN queues q ON q.id = qa.queue_id
             WHERE qa.tenant_id = ? AND qa.agent_id = ? AND qa.is_active = 1
             ORDER BY q.name ASC`
          )
          .bind(user.tenantId, agentIdParam)
          .all();

        results = result.results as Record<string, unknown>[];
      } else {
        // Return all assignments for the tenant's queues
        const result = await d1
          .prepare(
            `SELECT qa.id, qa.is_active, qa.created_at,
                    u.id as agent_id, u.name as agent_name, u.email as agent_email,
                    q.id as queue_id, q.name as queue_name, q.prefix as queue_prefix
             FROM queue_assignments qa
             JOIN users u ON u.id = qa.agent_id
             JOIN queues q ON q.id = qa.queue_id
             WHERE qa.tenant_id = ? AND qa.is_active = 1
             ORDER BY q.name ASC, u.name ASC`
          )
          .bind(user.tenantId)
          .all();

        results = result.results as Record<string, unknown>[];
      }

      const assignments = results.map((r) => ({
        id: r.id,
        agent: {
          id: r.agent_id,
          name: r.agent_name,
          email: r.agent_email,
        },
        queue: {
          id: r.queue_id,
          name: r.queue_name,
          prefix: r.queue_prefix,
        },
        isActive: r.is_active === 1,
        createdAt: r.created_at,
      }));

      return NextResponse.json({ assignments });
    } catch (error) {
      console.error('List queue assignments error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// POST: Create queue assignment (MANAGER only)
export const POST = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { agentId, queueId } = body as { agentId: string; queueId: string };

      if (!agentId || !queueId) {
        return NextResponse.json(
          { error: 'agentId and queueId are required' },
          { status: 400 }
        );
      }

      // Validate agent belongs to same tenant
      const agent = await d1
        .prepare('SELECT id, tenant_id, role FROM users WHERE id = ? AND is_active = 1')
        .bind(agentId)
        .first<{ id: string; tenant_id: string; role: string }>();

      if (!agent || agent.tenant_id !== user.tenantId) {
        return NextResponse.json(
          { error: 'Agent not found or not in your tenant' },
          { status: 404 }
        );
      }

      // Validate agent role is AGENT (managers see all queues by default)
      if (agent.role !== 'AGENT') {
        return NextResponse.json(
          { error: 'Only agents can be assigned to queues. Managers see all queues by default.' },
          { status: 400 }
        );
      }

      // Validate queue belongs to same tenant
      const queue = await d1
        .prepare('SELECT id, tenant_id FROM queues WHERE id = ? AND is_active = 1')
        .bind(queueId)
        .first<{ id: string; tenant_id: string }>();

      if (!queue || queue.tenant_id !== user.tenantId) {
        return NextResponse.json(
          { error: 'Queue not found or not in your tenant' },
          { status: 404 }
        );
      }

      // Check for existing assignment (active or soft-deleted)
      const existing = await d1
        .prepare('SELECT id, is_active FROM queue_assignments WHERE agent_id = ? AND queue_id = ? AND tenant_id = ?')
        .bind(agentId, queueId, user.tenantId)
        .first<{ id: string; is_active: number }>();

      let assignmentId: string;

      if (existing) {
        if (existing.is_active === 1) {
          return NextResponse.json(
            { error: 'Agent is already assigned to this queue' },
            { status: 409 }
          );
        }
        // Reactivate soft-deleted assignment
        await d1
          .prepare("UPDATE queue_assignments SET is_active = 1, updated_at = datetime('now') WHERE id = ?")
          .bind(existing.id)
          .run();
        assignmentId = existing.id;
      } else {
        // Create new assignment
        assignmentId = crypto.randomUUID();
        await d1
          .prepare(
            `INSERT INTO queue_assignments (id, tenant_id, queue_id, agent_id, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`
          )
          .bind(assignmentId, user.tenantId, queueId, agentId, dbNow(), dbNow())
          .run();
      }

      // Fetch the created assignment with joined info
      const assignment = await d1
        .prepare(
          `SELECT qa.id, qa.is_active, qa.created_at,
                  u.id as agent_id, u.name as agent_name, u.email as agent_email,
                  q.id as queue_id, q.name as queue_name, q.prefix as queue_prefix
           FROM queue_assignments qa
           JOIN users u ON u.id = qa.agent_id
           JOIN queues q ON q.id = qa.queue_id
           WHERE qa.id = ?`
        )
        .bind(assignmentId)
        .first<Record<string, unknown>>();

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
          'QUEUE_ASSIGNMENT_CREATE',
          JSON.stringify({ assignmentId, agentId, queueId }),
          ip
        )
        .run();

      return NextResponse.json(
        {
          assignment: {
            id: assignment!.id,
            agent: {
              id: assignment!.agent_id,
              name: assignment!.agent_name,
              email: assignment!.agent_email,
            },
            queue: {
              id: assignment!.queue_id,
              name: assignment!.queue_name,
              prefix: assignment!.queue_prefix,
            },
            isActive: assignment!.is_active === 1,
            createdAt: assignment!.created_at,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Create queue assignment error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);

// DELETE: Soft-delete queue assignment (MANAGER only)
export const DELETE = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();
      const body = await req.json();
      const { assignmentId } = body as { assignmentId: string };

      if (!assignmentId) {
        return NextResponse.json(
          { error: 'assignmentId is required' },
          { status: 400 }
        );
      }

      // Verify assignment belongs to same tenant
      const existing = await d1
        .prepare('SELECT id, tenant_id, agent_id, queue_id FROM queue_assignments WHERE id = ? AND is_active = 1')
        .bind(assignmentId)
        .first<{ id: string; tenant_id: string; agent_id: string; queue_id: string }>();

      if (!existing || existing.tenant_id !== user.tenantId) {
        return NextResponse.json(
          { error: 'Assignment not found' },
          { status: 404 }
        );
      }

      // Soft-delete
      await d1
        .prepare("UPDATE queue_assignments SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
        .bind(assignmentId)
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
          'QUEUE_ASSIGNMENT_DELETE',
          JSON.stringify({ assignmentId, agentId: existing.agent_id, queueId: existing.queue_id }),
          ip
        )
        .run();

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Delete queue assignment error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER'], requireTenantId: true }
);