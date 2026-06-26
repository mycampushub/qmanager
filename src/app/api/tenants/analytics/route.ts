import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { JwtPayload } from '@/lib/auth';

export const GET = withAuth(
  async (req: NextRequest, ctx: { user: JwtPayload }) => {
    const { user } = ctx;

    try {
      const tenantId = req.nextUrl.searchParams.get('tenantId') || user.tenantId;
      const dateFrom = req.nextUrl.searchParams.get('dateFrom');
      const dateTo = req.nextUrl.searchParams.get('dateTo');

      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId is required' },
          { status: 400 }
        );
      }

      // H-05: MANAGER and AGENT can only view own tenant analytics
      if (user.role !== 'PLATFORM_ADMIN' && user.tenantId !== tenantId) {
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

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

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

      // C2 + C3: Fetch completed tickets with timestamps for accurate average computation
      const completedWithTimes = await db.ticket.findMany({
        where: {
          ...ticketBase,
          status: 'COMPLETED',
          servedAt: { not: null },
          completedAt: { not: null },
        },
        select: { createdAt: true, servedAt: true, completedAt: true },
      });

      let avgWaitTimeSec = 0;
      let avgServiceTimeSec = 0;
      if (completedWithTimes.length > 0) {
        const totalWaitSec = completedWithTimes.reduce((sum, t) => {
          return sum + (t.servedAt!.getTime() - t.createdAt.getTime()) / 1000;
        }, 0);
        avgWaitTimeSec = Math.round(totalWaitSec / completedWithTimes.length);

        const totalServiceSec = completedWithTimes.reduce((sum, t) => {
          return sum + (t.completedAt!.getTime() - t.servedAt!.getTime()) / 1000;
        }, 0);
        avgServiceTimeSec = Math.round(totalServiceSec / completedWithTimes.length);
      }

      // D5: Fixed peak hour calculation — fetch timestamps and bucket by hour
      const hourTickets = await db.ticket.findMany({
        where: ticketBase,
        select: { createdAt: true },
      });
      const hourBuckets = new Array(24).fill(0);
      for (const t of hourTickets) {
        hourBuckets[t.createdAt.getHours()]++;
      }
      const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));

      // Queue stats with per-queue EWT (FIX A3)
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

          // FIX A3: Per-queue EWT using per-queue service logs
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

          // EWT = waiting count * avg service time per queue
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
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  // D11: Allow AGENT role with tenant isolation (agents can only see own tenant)
  { roles: ['AGENT', 'MANAGER', 'PLATFORM_ADMIN'] }
);