// =============================================================================
// QueueFlow — Public TV Display Endpoint
// Returns tenant info + queue stats for the TV display. No auth required.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getD1FromEnv } from '@/lib/db';

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
          mt.id AS master_id, mt.corporate_name
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
      }>();

    if (!tenantRow) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Fetch active queues with waiting counts in a single query
    const queuesResult = await d1
      .prepare(
        `SELECT q.*,
          (SELECT count(*) FROM tickets WHERE queue_id = q.id AND status = 'WAITING') as waiting_count
         FROM queues q
         WHERE q.tenant_id = ? AND q.is_active = 1
         ORDER BY q.name ASC`
      )
      .bind(tenantId)
      .all<{
        id: string;
        tenant_id: string;
        name: string;
        description: string | null;
        default_service_time_sec: number;
        prefix: string;
        current_serial: number;
        now_serving_serial: number;
        is_active: number;
        created_at: string;
        waiting_count: number;
      }>();

    // Batch: fetch all service logs for this tenant in a single query
    const logsResult = await d1
      .prepare(
        `SELECT queue_id, duration_seconds
         FROM service_logs
         WHERE tenant_id = ? AND duration_seconds IS NOT NULL
         ORDER BY created_at DESC LIMIT 200`
      )
      .bind(tenantId)
      .all<{ queue_id: string; duration_seconds: number }>();

    // Group service logs by queue_id and compute avg per queue
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

    const queuesWithStats = queuesResult.results.map((queue) => {
      const avgServiceTime = getAvgServiceTime(queue.id, queue.default_service_time_sec);
      const waiting = queue.waiting_count ?? 0;

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
        _waitingCount: waiting,
        _avgServiceTime: avgServiceTime,
        _ewt: waiting * avgServiceTime,
      };
    });

    return NextResponse.json({
      tenant: {
        id: tenantRow.id,
        name: tenantRow.name,
        welcomeMessage: tenantRow.welcome_message,
        logoUrl: tenantRow.logo_url,
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