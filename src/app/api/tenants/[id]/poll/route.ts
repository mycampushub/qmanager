// =============================================================================
// QueueFlow — Lightweight Poll Endpoint
// Returns minimal queue state for change detection by the polling hook.
// Called every 3 seconds by the client — must be fast and small.
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

    const result = d1
      .prepare(
        `SELECT id, now_serving_serial, current_serial
         FROM queues
         WHERE tenant_id = ? AND is_active = 1`
      )
      .bind(tenantId)
      .all<{ id: string; now_serving_serial: number; current_serial: number }>();

    return NextResponse.json({ queues: result.results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Poll failed' },
      { status: 500 }
    );
  }
}