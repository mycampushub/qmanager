// =============================================================================
// QueueFlow — Public TV Display Endpoint
// Returns tenant info + queue stats + waiting ticket serials for the TV display.
// No auth required.
//
// FIXES:
//   - Added per-counter serving data (which counter is serving which ticket)
//   - Added serving count per queue (how many tickets are actively SERVING)
//   - Added active counter count per queue
//   - EWT now accounts for active serving positions (counters serving + 1 for the caller)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';

interface ServingTicket {
  ticketId: string;
  serialNumber: number;
  customerName: string;
  counterId: string | null;
  counterName: string | null;
  servedAt: string;
}

interface CounterInfo {
  id: string;
  name: string;
  servingTicket: ServingTicket | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tenantId } = await params;
    const d1 = await getD1FromEnv();

    // Fetch tenant with master tenant info
    const tenantRow = await d1
      .prepare(
        `SELECT
          t.id, t.name, t.welcome_message, t.logo_url,
          mt.id AS master_id, mt.corporate_name,
          t.block_level, t.block_reason
         FROM tenants t
         LEFT JOIN master_tenants mt ON t.master_tenant_id = mt.id
         WHERE t.id = ? AND t.is_active = 1`
      )
      .bind(tenantId)
      .first<{
        id: string;
        name: string;
        welcome_message: string | null;
        logo_url: string | null;
        master_id: string | null;
        corporate_name: string | null;
        block_level: string | null;
        block_reason: string | null;
      }>();

    if (!tenantRow) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Optional queueId filter for join flow
    const queueIdParam = request.nextUrl.searchParams.get('queueId');

    // Fetch active queues with waiting + serving counts in a single query
    let queuesSql = `SELECT q.*,
          (SELECT count(*) FROM tickets WHERE queue_id = q.id AND status = 'WAITING') as waiting_count,
          (SELECT count(*) FROM tickets WHERE queue_id = q.id AND status = 'SERVING') as serving_count,
          l.id as location_id, l.name as location_name
         FROM queues q
         LEFT JOIN locations l ON q.location_id = l.id
         WHERE q.tenant_id = ? AND q.is_active = 1`;
    const queueBinds: unknown[] = [tenantId];

    if (queueIdParam) {
      queuesSql += ' AND q.id = ?';
      queueBinds.push(queueIdParam);
    }

    queuesSql += ' ORDER BY q.name ASC';

    const queuesResult = await d1
      .prepare(queuesSql)
      .bind(...queueBinds)
      .all<{
        id: string;
        tenant_id: string;
        name: string;
        location_tag: string | null;
        description: string | null;
        default_service_time_sec: number;
        prefix: string;
        current_serial: number;
        now_serving_serial: number;
        is_active: number;
        created_at: string;
        waiting_count: number;
        serving_count: number;
        location_id: string | null;
        location_name: string | null;
        join_paused: number;
      }>();

    const queueIds = queuesResult.results.map(q => q.id);

    // ── Batch: service logs for avg service time ──
    const logsResult = await d1
      .prepare(
        `SELECT queue_id, duration_seconds
         FROM service_logs
         WHERE tenant_id = ? AND duration_seconds IS NOT NULL
         ORDER BY created_at DESC LIMIT 200`
      )
      .bind(tenantId)
      .all<{ queue_id: string; duration_seconds: number }>();

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

    // ── Batch: active service counters per queue ──
    const countersByQueue = new Map<string, CounterInfo[]>();

    if (queueIds.length > 0) {
      const placeholders = queueIds.map(() => '?').join(',');

      // Fetch all active counters
      const countersResult = await d1
        .prepare(
          `SELECT sc.id, sc.queue_id, sc.name
           FROM service_counters sc
           WHERE sc.queue_id IN (${placeholders}) AND sc.is_active = 1
           ORDER BY sc.name ASC`
        )
        .bind(...queueIds)
        .all<{ id: string; queue_id: string; name: string }>();

      // Fetch all currently SERVING tickets with counter info
      const servingResult = await d1
        .prepare(
          `SELECT t.id as ticket_id, t.queue_id, t.serial_number, t.customer_name, t.served_at,
                  t.counter_id, sc.name as counter_name
           FROM tickets t
           LEFT JOIN service_counters sc ON t.counter_id = sc.id
           WHERE t.queue_id IN (${placeholders}) AND t.status = 'SERVING'
           ORDER BY t.served_at ASC`
        )
        .bind(...queueIds)
        .all<{
          ticket_id: string;
          queue_id: string;
          serial_number: number;
          customer_name: string;
          served_at: string;
          counter_id: string | null;
          counter_name: string | null;
        }>();

      // Build serving map: queueId → Map<counterId, ServingTicket>
      const servingByQueueAndCounter = new Map<string, Map<string, ServingTicket>>();
      for (const s of servingResult.results) {
        const queueMap = servingByQueueAndCounter.get(s.queue_id) ?? new Map<string, ServingTicket>();
        const key = s.counter_id || '_no_counter_';
        queueMap.set(key, {
          ticketId: s.ticket_id,
          serialNumber: s.serial_number,
          customerName: s.customer_name,
          counterId: s.counter_id,
          counterName: s.counter_name,
          servedAt: s.served_at,
        });
        servingByQueueAndCounter.set(s.queue_id, queueMap);
      }

      // Build counters per queue
      for (const counter of countersResult.results) {
        const arr = countersByQueue.get(counter.queue_id) ?? [];
        const queueServingMap = servingByQueueAndCounter.get(counter.queue_id);
        const serving = queueServingMap?.get(counter.id) ?? null;
        arr.push({
          id: counter.id,
          name: counter.name,
          servingTicket: serving,
        });
        countersByQueue.set(counter.queue_id, arr);
      }

      // Also add serving tickets that don't have a counter assigned (legacy)
      for (const [qId, queueServingMap] of servingByQueueAndCounter) {
        const noCounter = queueServingMap.get('_no_counter_');
        if (noCounter) {
          const arr = countersByQueue.get(qId) ?? [];
          arr.push({
            id: '_no_counter_',
            name: 'Counter',
            servingTicket: noCounter,
          });
          countersByQueue.set(qId, arr);
        }
      }
    }

    // ── Batch: waiting ticket serials for each queue ──
    const waitingSerialsByQueue = new Map<string, Array<{ serialNumber: number; customerName: string }>>();

    if (queueIds.length > 0) {
      const placeholders = queueIds.map(() => '?').join(',');
      const waitingResult = await d1
        .prepare(
          `SELECT queue_id, serial_number, customer_name
           FROM tickets
           WHERE queue_id IN (${placeholders}) AND status = 'WAITING'
           ORDER BY serial_number ASC`
        )
        .bind(...queueIds)
        .all<{ queue_id: string; serial_number: number; customer_name: string }>();

      for (const row of waitingResult.results) {
        const arr = waitingSerialsByQueue.get(row.queue_id);
        if (arr) {
          if (arr.length < 15) arr.push({ serialNumber: row.serial_number, customerName: row.customer_name });
        } else {
          waitingSerialsByQueue.set(row.queue_id, [{ serialNumber: row.serial_number, customerName: row.customer_name }]);
        }
      }
    }

    // ── Build final queue data with corrected EWT ──
    const queuesWithStats = queuesResult.results.map((queue) => {
      const avgServiceTime = getAvgServiceTime(queue.id, queue.default_service_time_sec);
      const waiting = queue.waiting_count ?? 0;
      const serving = queue.serving_count ?? 0;
      const waitingSerials = waitingSerialsByQueue.get(queue.id) ?? [];
      const counters = countersByQueue.get(queue.id) ?? [];

      // Active serving positions = currently SERVING tickets + 1 for the caller
      // This accounts for multi-counter queues: EWT = waiting * avgTime / activePositions
      const activePositions = Math.max(serving + 1, 1);
      const rawEwt = waiting * avgServiceTime;
      const ewt = Math.ceil(rawEwt / activePositions);

      // Build the "serving tickets" list for display (tickets currently being served)
      const servingTickets: ServingTicket[] = [];
      for (const c of counters) {
        if (c.servingTicket) {
          servingTickets.push(c.servingTicket);
        }
      }

      return {
        id: queue.id,
        tenantId: queue.tenant_id,
        name: queue.name,
        description: queue.description,
        defaultServiceTimeSec: queue.default_service_time_sec,
        prefix: queue.prefix,
        currentSerial: queue.current_serial,
        nowServingSerial: queue.now_serving_serial,
        isActive: queue.is_active === 1,
        locationTag: queue.location_tag,
        joinPaused: queue.join_paused === 1,
        locationId: queue.location_id,
        locationName: queue.location_name,
        _waitingCount: waiting,
        _servingCount: serving,
        _activeCounterCount: counters.filter(c => c.id !== '_no_counter_').length,
        _avgServiceTime: avgServiceTime,
        _ewt: ewt,
        _waitingSerials: waitingSerials,
        _servingTickets: servingTickets,
        _counters: counters,
      };
    });

    return NextResponse.json({
      tenant: {
        id: tenantRow.id,
        name: tenantRow.name,
        welcomeMessage: tenantRow.welcome_message,
        logoUrl: tenantRow.logo_url,
        blockLevel: tenantRow.block_level,
        blockReason: tenantRow.block_reason,
        masterTenant: tenantRow.master_id
          ? { id: tenantRow.master_id, corporateName: tenantRow.corporate_name }
          : null,
        _queues: queuesWithStats,
      },
    });
  } catch (error) {
    console.error('Display endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}