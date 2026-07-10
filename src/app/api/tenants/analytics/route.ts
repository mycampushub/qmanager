import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getD1FromEnv } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const dateFrom = req.nextUrl.searchParams.get('dateFrom');
      const dateTo = req.nextUrl.searchParams.get('dateTo');

      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
      }

      // H-05: MANAGER and AGENT can only view own tenant analytics
      if (user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant analytics' },
          { status: 403 }
        );
      }

      // B11: Date range validation
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

      // Build date filter SQL fragments
      const dateConditions: string[] = [];
      const dateBinds: unknown[] = [];
      if (dateFromISO) { dateConditions.push('created_at >= ?'); dateBinds.push(dateFromISO); }
      if (dateToISO) { dateConditions.push('created_at <= ?'); dateBinds.push(dateToISO); }
      const dateWhere = dateConditions.length > 0 ? `AND ${dateConditions.join(' AND ')}` : '';

      const d1 = await getD1FromEnv();

      // ── Overall stats ──────────────────────────────────────────────────
      const [totalResult, completedResult, skippedResult] = await Promise.all([
        d1
          .prepare(`SELECT count(*) as cnt FROM tickets WHERE tenant_id = ? ${dateWhere}`)
          .bind(tenantId, ...dateBinds)
          .first<{ cnt: number }>(),
        d1
          .prepare(`SELECT count(*) as cnt FROM tickets WHERE tenant_id = ? AND status = 'COMPLETED' ${dateWhere}`)
          .bind(tenantId, ...dateBinds)
          .first<{ cnt: number }>(),
        d1
          .prepare(`SELECT count(*) as cnt FROM tickets WHERE tenant_id = ? AND status = 'SKIPPED' ${dateWhere}`)
          .bind(tenantId, ...dateBinds)
          .first<{ cnt: number }>(),
      ]);

      const totalTickets = totalResult?.cnt ?? 0;
      const completedTickets = completedResult?.cnt ?? 0;
      const skippedTickets = skippedResult?.cnt ?? 0;

      // ── C2 + C3: Avg wait/service time from completed tickets ──────────
      const completedWithTimes = await d1
        .prepare(
          `SELECT created_at, served_at, completed_at
           FROM tickets
           WHERE tenant_id = ? AND status = 'COMPLETED' AND served_at IS NOT NULL AND completed_at IS NOT NULL ${dateWhere}`
        )
        .bind(tenantId, ...dateBinds)
        .all<{ created_at: string; served_at: string; completed_at: string }>();

      let avgWaitTimeSec = 0;
      let avgServiceTimeSec = 0;
      if (completedWithTimes.results.length > 0) {
        const rows = completedWithTimes.results;
        const totalWaitSec = rows.reduce((sum, t) => {
          return sum + (new Date(t.served_at).getTime() - new Date(t.created_at).getTime()) / 1000;
        }, 0);
        avgWaitTimeSec = Math.round(totalWaitSec / rows.length);

        const totalServiceSec = rows.reduce((sum, t) => {
          return sum + (new Date(t.completed_at).getTime() - new Date(t.served_at).getTime()) / 1000;
        }, 0);
        avgServiceTimeSec = Math.round(totalServiceSec / rows.length);
      }

      // ── D5: Peak hour calculation ──────────────────────────────────────
      const hourTickets = await d1
        .prepare(`SELECT created_at FROM tickets WHERE tenant_id = ? ${dateWhere}`)
        .bind(tenantId, ...dateBinds)
        .all<{ created_at: string }>();

      const hourBuckets = new Array(24).fill(0) as number[];
      for (const t of hourTickets.results) {
        hourBuckets[new Date(t.created_at).getHours()]++;
      }
      const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));

      // ── Queue stats with per-queue EWT ─────────────────────────────────
      const queues = await d1
        .prepare(`SELECT id, name, prefix, default_service_time_sec FROM queues WHERE tenant_id = ? AND is_active = 1`)
        .bind(tenantId)
        .all<{ id: string; name: string; prefix: string; default_service_time_sec: number }>();

      const queueStats = await Promise.all(
        queues.results.map(async (queue) => {
          // Waiting and serving counts (no date filter — these are live counts)
          const [waitingResult, servingResult, completedQResult] = await Promise.all([
            d1
              .prepare(`SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = 'WAITING'`)
              .bind(queue.id)
              .first<{ cnt: number }>(),
            d1
              .prepare(`SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = 'SERVING'`)
              .bind(queue.id)
              .first<{ cnt: number }>(),
            // Completed count respects date filter
            d1
              .prepare(`SELECT count(*) as cnt FROM tickets WHERE queue_id = ? AND status = 'COMPLETED' ${dateWhere}`)
              .bind(queue.id, ...dateBinds)
              .first<{ cnt: number }>(),
          ]);

          // FIX A3: Per-queue EWT using per-queue service logs
          const logsResult = await d1
            .prepare(
              `SELECT duration_seconds FROM service_logs
               WHERE tenant_id = ? AND queue_id = ? AND duration_seconds IS NOT NULL
               ORDER BY created_at DESC LIMIT 20`
            )
            .bind(tenantId, queue.id)
            .all<{ duration_seconds: number }>();

          const queueAvgServiceTime =
            logsResult.results.length > 0
              ? Math.round(
                  logsResult.results.reduce(
                    (sum, s) => sum + s.duration_seconds,
                    0
                  ) / logsResult.results.length
                )
              : queue.default_service_time_sec;

          const ewt = (waitingResult?.cnt ?? 0) * queueAvgServiceTime;

          return {
            queueId: queue.id,
            queueName: queue.name,
            prefix: queue.prefix,
            waiting: waitingResult?.cnt ?? 0,
            serving: servingResult?.cnt ?? 0,
            completed: completedQResult?.cnt ?? 0,
            avgServiceTime: queueAvgServiceTime,
            ewt,
          };
        })
      );

      // ── M-13: Recent activity (respects date filter) ───────────────────
      const recentTickets = await d1
        .prepare(
          `SELECT t.id, t.status, t.customer_name, t.serial_number, t.created_at,
                  q.name as queue_name, q.prefix as queue_prefix
           FROM tickets t
           JOIN queues q ON q.id = t.queue_id
           WHERE t.tenant_id = ? ${dateWhere}
           ORDER BY t.created_at DESC LIMIT 20`
        )
        .bind(tenantId, ...dateBinds)
        .all<{
          id: string;
          status: string;
          customer_name: string;
          serial_number: number;
          created_at: string;
          queue_name: string;
          queue_prefix: string;
        }>();

      const recentActivity = recentTickets.results.map((t) => ({
        id: t.id,
        type: t.status as
          | 'JOINED'
          | 'CALLED'
          | 'COMPLETED'
          | 'SKIPPED'
          | 'CANCELLED',
        customerName: t.customer_name,
        ticketSerial: `${t.queue_prefix}${String(t.serial_number).padStart(3, '0')}`,
        queueName: t.queue_name,
        timestamp: t.created_at,
      }));

      return NextResponse.json({
        totalTickets,
        completedToday: completedTickets,
        skippedToday: skippedTickets,
        avgWaitTimeSec,
        avgServiceTimeSec,
        peakHour: `${String(peakHour).padStart(2, '0')}:00`,
        queueStats,
        recentActivity,
      });
    } catch (error) {
      console.error('Analytics error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  // D11: Allow AGENT role with tenant isolation
  { roles: ['AGENT', 'MANAGER', 'PLATFORM_ADMIN'] }
);