// =============================================================================
// QueueFlow — CSV Export (CF Workers compatible)
// Replaces: src/lib/csv-export.ts
//
// Changes: Uses Response instead of NextResponse for CF Workers compatibility.
//   Both work in Next.js, but Response is the universal Web API.
// =============================================================================

/**
 * Convert analytics data to CSV and return a downloadable Response.
 */
export function analyticsToCSV(
  data: Record<string, unknown>,
  filename: string = 'analytics.csv'
): Response {
  const rows: string[][] = [];

  // ── Summary Section ──────────────────────────────────────────────────
  rows.push(['--- QueueFlow Analytics Export ---']);
  rows.push(['Exported At', String(data.exportedAt ?? new Date().toISOString())]);
  rows.push([]);
  rows.push(['Summary']);
  rows.push(['Total Tickets', String(data.totalTickets ?? 0)]);
  rows.push(['Completed', String(data.completedToday ?? 0)]);
  rows.push(['Skipped', String(data.skippedToday ?? 0)]);
  rows.push(['Avg Wait Time (sec)', String(data.avgWaitTimeSec ?? 0)]);
  rows.push(['Avg Service Time (sec)', String(data.avgServiceTimeSec ?? 0)]);
  rows.push(['Peak Hour', String(data.peakHour ?? 'N/A')]);
  rows.push([]);

  // ── Queue Stats Section ──────────────────────────────────────────────
  const queueStats = (data.queueStats as Record<string, unknown>[]) ?? [];
  rows.push(['Queue Stats']);
  rows.push(['Queue ID', 'Queue Name', 'Prefix', 'Waiting', 'Serving', 'Completed', 'Avg Service Time (sec)', 'Est. Wait Time (sec)']);
  for (const qs of queueStats) {
    rows.push([
      String(qs.queueId ?? ''),
      String(qs.queueName ?? ''),
      String(qs.prefix ?? ''),
      String(qs.waiting ?? 0),
      String(qs.serving ?? 0),
      String(qs.completed ?? 0),
      String(qs.avgServiceTime ?? 0),
      String(qs.ewt ?? 0),
    ]);
  }
  rows.push([]);

  // ── Recent Activity Section ──────────────────────────────────────────
  const recentActivity = (data.recentActivity as Record<string, unknown>[]) ?? [];
  rows.push(['Recent Activity']);
  rows.push(['ID', 'Type', 'Customer Name', 'Ticket Serial', 'Queue Name', 'Timestamp']);
  for (const act of recentActivity) {
    rows.push([
      String(act.id ?? ''),
      String(act.type ?? ''),
      String(act.customerName ?? ''),
      String(act.ticketSerial ?? ''),
      String(act.queueName ?? ''),
      String(act.timestamp ?? ''),
    ]);
  }

  // ── Build CSV string ─────────────────────────────────────────────────
  const csvContent = rows
    .map((row) =>
      row.map((cell) => {
        if (/[",\r\n]/.test(cell)) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    )
    .join('\n');

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}