import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';
import { analyticsToCSV } from '@/lib/csv-export';

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const dateFrom = req.nextUrl.searchParams.get('dateFrom');
      const dateTo = req.nextUrl.searchParams.get('dateTo');
      const format = req.nextUrl.searchParams.get('format') || 'json';

      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
        );
      }

      // MANAGER can only view own tenant analytics
      if (user.role === 'MANAGER' && user.tenantId !== tenantId) {
        return NextResponse.json(
          { error: 'You can only view your own tenant analytics' },
          { status: 403 }
        );
      }

      // Date range filters
      const dateFilter: Record<string, Date | undefined> = {};
      if (dateFrom) {
        const parsed = new Date(dateFrom);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: 'Invalid dateFrom format' }, { status: 400 });
        }
        dateFilter.gte = parsed;
      }
      if (dateTo) {
        const parsed = new Date(dateTo);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: 'Invalid dateTo format' }, { status: 400 });
        }
        parsed.setHours(23, 59, 59, 999);
        dateFilter.lte = parsed;
      }

      // Base ticket filter
      const ticketBase: Record<string, unknown> = { tenantId };
      if (Object.keys(dateFilter).length > 0) {
        ticketBase.createdAt = dateFilter;
      }

      // Overall stats
      const [totalTickets, completedTickets, skippedTickets] = await Promise.all([
        db.ticket.count({ where: ticketBase }),
        db.ticket.count({
          where: { ...ticketBase, status: 'COMPLETED' },
        }),
        db.ticket.count({
          where: { ...ticketBase, status: 'SKIPPED' },
        }),
      ]);

      // Avg wait time (completed tickets: completedAt - createdAt)
      const completedWithTimes = await db.ticket.findMany({
        where: {
          ...ticketBase,
          status: 'COMPLETED',
          completedAt: { not: null },
          servedAt: { not: null },
        },
        select: { createdAt: true, servedAt: true, completedAt: true },
      });

      const avgWaitTimeSec =
        completedWithTimes.length > 0
          ? Math.round(
              completedWithTimes.reduce((sum, t) => {
                const wait = (t.servedAt!.getTime() - t.createdAt.getTime()) / 1000;
                return sum + wait;
              }, 0) / completedWithTimes.length
            )
          : 0;

      const avgServiceTimeSec =
        completedWithTimes.length > 0
          ? Math.round(
              completedWithTimes.reduce((sum, t) => {
                const svc = (t.completedAt!.getTime() - t.servedAt!.getTime()) / 1000;
                return sum + svc;
              }, 0) / completedWithTimes.length
            )
          : 0;

      // Peak hour calculation
      const hourBuckets = new Array(24).fill(0);
      for (const t of await db.ticket.findMany({
        where: ticketBase,
        select: { createdAt: true },
      })) {
        hourBuckets[t.createdAt.getHours()]++;
      }
      const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));

      // Queue stats with per-queue EWT
      const queues = await db.queue.findMany({
        where: { tenantId, isActive: true },
      });

      const queueStats = await Promise.all(
        queues.map(async (queue) => {
          const queueTicketBase: Record<string, unknown> = {
            tenantId,
            queueId: queue.id,
          };
          if (Object.keys(dateFilter).length > 0) {
            queueTicketBase.createdAt = dateFilter;
          }

          const [waiting, serving, completed] = await Promise.all([
            db.ticket.count({
              where: { queueId: queue.id, status: 'WAITING' },
            }),
            db.ticket.count({
              where: { queueId: queue.id, status: 'SERVING' },
            }),
            db.ticket.count({
              where: { ...queueTicketBase, status: 'COMPLETED' },
            }),
          ]);

          const serviceLogs = await db.serviceLog.findMany({
            where: {
              tenantId,
              queueId: queue.id,
              durationSeconds: { not: null },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { durationSeconds: true },
          });

          const queueAvgServiceTime =
            serviceLogs.length > 0
              ? Math.round(
                  serviceLogs.reduce(
                    (sum, s) => sum + (s.durationSeconds ?? 0),
                    0
                  ) / serviceLogs.length
                )
              : queue.defaultServiceTimeSec;

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
        })
      );

      // M-13: Recent activity must also respect date filter
      const recentWhere: Record<string, unknown> = { tenantId };
      if (Object.keys(dateFilter).length > 0) {
        recentWhere.createdAt = dateFilter;
      }
      const recentTickets = await db.ticket.findMany({
        where: recentWhere,
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { queue: { select: { name: true, prefix: true } } },
      });

      const recentActivity = recentTickets.map((t) => ({
        id: t.id,
        type: t.status as
          | 'JOINED'
          | 'CALLED'
          | 'COMPLETED'
          | 'SKIPPED'
          | 'CANCELLED',
        customerName: t.customerName,
        ticketSerial: `${t.queue.prefix}${String(t.serialNumber).padStart(3, '0')}`,
        queueName: t.queue.name,
        timestamp: t.createdAt.toISOString(),
      }));

      const analyticsData: Record<string, unknown> = {
        totalTickets,
        completedToday: completedTickets,
        skippedToday: skippedTickets,
        avgWaitTimeSec,
        avgServiceTimeSec,
        peakHour: `${String(peakHour).padStart(2, '0')}:00`,
        queueStats,
        recentActivity,
        exportedAt: new Date().toISOString(),
      };

      // ── Format switch ──────────────────────────────────────────
      if (format === 'csv') {
        const dateSlug = dateFrom && dateTo
          ? `${dateFrom}_to_${dateTo}`
          : new Date().toISOString().slice(0, 10);
        return analyticsToCSV(analyticsData, `analytics_${dateSlug}.csv`);
      }

      // Default: JSON
      return new NextResponse(JSON.stringify(analyticsData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="analytics.json"',
        },
      });
    } catch (error) {
      console.error('Analytics export error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { roles: ['MANAGER', 'PLATFORM_ADMIN'] }
);