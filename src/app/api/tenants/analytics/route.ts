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

      // ── Queue stats with per-queue EWT (optimized: 3 queries instead of N*4) ──
      const queues = await d1
        .prepare(`SELECT id, name, prefix, default_service_time_sec FROM queues WHERE tenant_id = ? AND is_active = 1`)
        .bind(tenantId)
        .all<{ id: string; name: string; prefix: string; default_service_time_sec: number }>();

      const queueIds = queues.results.map((q) => q.id);

      // Single query for live counts (waiting, serving) — no date filter
      let liveCounts: { queue_id: string; waiting: number; serving: number }[] = [];
      // Single query for completed counts — with date filter
      let completedCounts: { queue_id: string; completed: number }[] = [];

      if (queueIds.length > 0) {
        const placeholders = queueIds.map(() => '?').join(', ');

        const [liveResult, completedResult] = await d1.batch([
          d1
            .prepare(
              `SELECT queue_id,
                SUM(CASE WHEN status = 'WAITING' THEN 1 ELSE 0 END) as waiting,
                SUM(CASE WHEN status = 'SERVING' THEN 1 ELSE 0 END) as serving
               FROM tickets
               WHERE tenant_id = ? AND queue_id IN (${placeholders})
               GROUP BY queue_id`
            )
            .bind(tenantId, ...queueIds),
          d1
            .prepare(
              `SELECT queue_id, count(*) as completed
               FROM tickets
               WHERE tenant_id = ? AND queue_id IN (${placeholders}) AND status = 'COMPLETED' ${dateWhere}
               GROUP BY queue_id`
            )
            .bind(tenantId, ...queueIds, ...dateBinds),
        ]);

        liveCounts = liveResult.results as { queue_id: string; waiting: number; serving: number }[];
        completedCounts = completedResult.results as { queue_id: string; completed: number }[];
      }

      // Build maps for quick lookup
      const liveMap = new Map<string, { waiting: number; serving: number }>();
      for (const c of liveCounts) {
        liveMap.set(c.queue_id, { waiting: c.waiting, serving: c.serving });
      }
      const completedMap = new Map<string, number>();
      for (const c of completedCounts) {
        completedMap.set(c.queue_id, c.completed);
      }

      // Single query for all service logs across queues
      const logsResult = await d1
        .prepare(
          `SELECT queue_id, duration_seconds
           FROM service_logs
           WHERE tenant_id = ? AND duration_seconds IS NOT NULL
           ORDER BY created_at DESC LIMIT 200`
        )
        .bind(tenantId)
        .all<{ queue_id: string; duration_seconds: number }>();

      // Group durations by queue_id
      const durationsByQueue = new Map<string, number[]>();
      for (const log of logsResult.results) {
        const arr = durationsByQueue.get(log.queue_id);
        if (arr) {
          arr.push(log.duration_seconds);
        } else {
          durationsByQueue.set(log.queue_id, [log.duration_seconds]);
        }
      }

      function getAvgServiceTime(queueId: string, defaultTime: number): number {
        const durations = durationsByQueue.get(queueId);
        if (!durations || durations.length === 0) return defaultTime;
        return Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
      }

      const queueStats = queues.results.map((queue) => {
        const live = liveMap.get(queue.id);
        const waiting = live?.waiting ?? 0;
        const serving = live?.serving ?? 0;
        const completed = completedMap.get(queue.id) ?? 0;
        const queueAvgServiceTime = getAvgServiceTime(queue.id, queue.default_service_time_sec);
        const ewt = waiting * queueAvgServiceTime;

        return {
          queueId: queue.id,
          queueName: queue.name,
          prefix: queue.prefix,
          waiting,
          serving,
          completed,
          avgServiceTime: queueAvgServiceTime,
          ewt,
        };
      });

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