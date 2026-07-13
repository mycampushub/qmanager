import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv, type D1PreparedStatement } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

// GET: Agent performance metrics (MANAGER or PLATFORM_ADMIN)
export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const d1 = await getD1FromEnv();

      // Determine tenant scope
      let effectiveTenantId: string;
      if (user.role === 'MANAGER') {
        if (!user.tenantId) {
          return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
        }
        effectiveTenantId = user.tenantId;
      } else {
        // PLATFORM_ADMIN: accept optional tenantId filter
        const tenantIdParam = req.nextUrl.searchParams.get('tenantId');
        if (!tenantIdParam) {
          return NextResponse.json({ error: 'tenantId query parameter is required for platform admins' }, { status: 400 });
        }
        effectiveTenantId = tenantIdParam;
      }

      // Optional filters
      const agentIdParam = req.nextUrl.searchParams.get('agentId');
      const dateFrom = req.nextUrl.searchParams.get('dateFrom');
      const dateTo = req.nextUrl.searchParams.get('dateTo');

      // Date range validation
      let dateFromISO: string | null = null;
      let dateToISO: string | null = null;

      if (dateFrom) {
        const parsed = new Date(dateFrom);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: 'Invalid dateFrom format' }, { status: 400 });
        }
        dateFromISO = parsed.toISOString();
      }
      if (dateTo) {
        const parsed = new Date(dateTo);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: 'Invalid dateTo format' }, { status: 400 });
        }
        parsed.setHours(23, 59, 59, 999);
        dateToISO = parsed.toISOString();
      }

      // Build date filter fragments
      const dateConditions: string[] = [];
      const dateBinds: unknown[] = [];
      if (dateFromISO) { dateConditions.push('created_at >= ?'); dateBinds.push(dateFromISO); }
      if (dateToISO) { dateConditions.push('created_at <= ?'); dateBinds.push(dateToISO); }
      const dateWhere = dateConditions.length > 0 ? `AND ${dateConditions.join(' AND ')}` : '';

      // Today start in ISO for "todayServed"
      const now = new Date();
      const todayStartISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      // 1. Get agents
      let agents: { id: string; name: string; email: string }[];

      if (agentIdParam) {
        // Single agent lookup — verify they belong to the tenant
        const agent = await d1
          .prepare(
            'SELECT id, name, email FROM users WHERE id = ? AND tenant_id = ? AND role = ? AND is_active = 1'
          )
          .bind(agentIdParam, effectiveTenantId, 'AGENT')
          .first<{ id: string; name: string; email: string }>();

        if (!agent) {
          return NextResponse.json({ error: 'Agent not found in this tenant' }, { status: 404 });
        }
        agents = [agent];
      } else {
        const result = await d1
          .prepare(
            'SELECT id, name, email FROM users WHERE tenant_id = ? AND role = ? AND is_active = 1'
          )
          .bind(effectiveTenantId, 'AGENT')
          .all<{ id: string; name: string; email: string }>();

        agents = result.results;
      }

      if (agents.length === 0) {
        return NextResponse.json({ agents: [] });
      }

      // 2. Batch queries per agent
      // For each agent, we need:
      //   - totalServed: count of COMPLETED tickets where served_by_agent = agent (with date filter)
      //   - avgServiceTimeSec: avg duration_seconds from service_logs (with date filter)
      //   - todayServed: count of COMPLETED tickets today
      //   - currentlyServing: has a SERVING ticket
      //   - totalSkipped: count of TICKET_SKIP audit logs

      // Build batch statements: 5 queries per agent
      const batchStmts: D1PreparedStatement[] = [];

      for (const agent of agents) {
        // totalServed
        batchStmts.push(
          d1
            .prepare(
              `SELECT count(*) as cnt FROM tickets WHERE served_by_agent = ? AND status = 'COMPLETED' AND tenant_id = ? ${dateWhere}`
            )
            .bind(agent.id, effectiveTenantId, ...dateBinds)
        );
        // avgServiceTimeSec
        batchStmts.push(
          d1
            .prepare(
              `SELECT avg(duration_seconds) as avg_dur FROM service_logs WHERE agent_id = ? AND tenant_id = ? AND duration_seconds IS NOT NULL ${dateWhere}`
            )
            .bind(agent.id, effectiveTenantId, ...dateBinds)
        );
        // todayServed
        batchStmts.push(
          d1
            .prepare(
              `SELECT count(*) as cnt FROM tickets WHERE served_by_agent = ? AND status = 'COMPLETED' AND tenant_id = ? AND created_at >= ?`
            )
            .bind(agent.id, effectiveTenantId, todayStartISO)
        );
        // currentlyServing
        batchStmts.push(
          d1
            .prepare(
              `SELECT id FROM tickets WHERE served_by_agent = ? AND status = 'SERVING' AND tenant_id = ? LIMIT 1`
            )
            .bind(agent.id, effectiveTenantId)
        );
        // totalSkipped
        batchStmts.push(
          d1
            .prepare(
              `SELECT count(*) as cnt FROM audit_logs WHERE user_id = ? AND action = 'TICKET_SKIP' AND user_type = 'staff' ${dateWhere}`
            )
            .bind(agent.id, ...dateBinds)
        );
      }

      const batchResults = await d1.batch(batchStmts);

      // 3. Assemble results
      interface AgentPerf {
        agentId: string;
        agentName: string;
        totalServed: number;
        totalSkipped: number;
        avgServiceTimeSec: number;
        avgWaitTimeSec: number;
        todayServed: number;
        currentlyServing: boolean;
      }

      const agentPerformance: AgentPerf[] = agents.map((agent, i) => {
        const base = i * 5;
        const totalServed = ((batchResults[base].results as { cnt: number }[])[0]?.cnt) ?? 0;
        const avgDur = ((batchResults[base + 1].results as { avg_dur: number | null }[])[0]?.avg_dur) ?? null;
        const avgServiceTimeSec = avgDur !== null ? Math.round(avgDur) : 0;
        const todayServed = ((batchResults[base + 2].results as { cnt: number }[])[0]?.cnt) ?? 0;
        const currentlyServing = (batchResults[base + 3].results as { id: string }[]).length > 0;
        const totalSkipped = ((batchResults[base + 4].results as { cnt: number }[])[0]?.cnt) ?? 0;

        return {
          agentId: agent.id,
          agentName: agent.name,
          totalServed,
          totalSkipped,
          avgServiceTimeSec,
          avgWaitTimeSec: 0,
          todayServed,
          currentlyServing,
        };
      });

      // 4. Compute avgWaitTimeSec per agent using JS (requires per-agent ticket data)
      // Batch: get created_at and served_at for completed tickets per agent
      const waitBatchStmts: D1PreparedStatement[] = [];
      for (const agent of agents) {
        waitBatchStmts.push(
          d1
            .prepare(
              `SELECT created_at, served_at FROM tickets
               WHERE served_by_agent = ? AND status = 'COMPLETED' AND tenant_id = ? AND served_at IS NOT NULL ${dateWhere}
               ORDER BY created_at DESC LIMIT 100`
            )
            .bind(agent.id, effectiveTenantId, ...dateBinds)
        );
      }

      const waitResults = await d1.batch(waitBatchStmts);

      for (let i = 0; i < agents.length; i++) {
        const rows = waitResults[i].results as { created_at: string; served_at: string }[];
        if (rows.length > 0) {
          const totalWaitSec = rows.reduce(
            (sum, t) => sum + (new Date(t.served_at).getTime() - new Date(t.created_at).getTime()) / 1000,
            0
          );
          agentPerformance[i].avgWaitTimeSec = Math.round(totalWaitSec / rows.length);
        } else {
          agentPerformance[i].avgWaitTimeSec = 0;
        }
      }

      return NextResponse.json({ agents: agentPerformance });
    } catch (error) {
      console.error('Agent performance error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);