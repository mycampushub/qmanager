'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAppStore } from '@/stores/app-store';

// ─── CROSS-BRANCH ANALYTICS TAB ─────────────────────────────
export default function CrossBranchAnalyticsTab() {
  const mtToken = useAppStore((s) => s.mtToken);
  const [analytics, setAnalytics] = useState<{
    totalTickets: number;
    completedToday: number;
    avgWaitTimeSec: number;
    branches: Array<{ name: string; totalTickets: number; completed: number; waiting: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/master-tenant/analytics', {
        headers: { Authorization: `Bearer ${mtToken}` },
      });
      const data = await res.json();
      setAnalytics({
        totalTickets: data.totalTickets ?? 0,
        completedToday: data.completedToday ?? 0,
        avgWaitTimeSec: data.avgWaitTimeSec ?? 0,
        branches: data.branches ?? [],
      });
    } catch {
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [mtToken]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cross-Branch Analytics</h2>
        <p className="text-sm text-muted-foreground">
          Overview across all {analytics.branches.length} branch{analytics.branches.length !== 1 ? 'es' : ''}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total Tickets Today</p>
            <p className="text-2xl font-bold">{analytics.totalTickets}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Completed Today</p>
            <p className="text-2xl font-bold">{analytics.completedToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Avg Wait Time</p>
            <p className="text-2xl font-bold">{analytics.avgWaitTimeSec}s</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Branches</p>
            <p className="text-2xl font-bold">{analytics.branches.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Branch Breakdown Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-center">Total Tickets</TableHead>
                  <TableHead className="text-center">Completed</TableHead>
                  <TableHead className="text-center">Waiting</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.branches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No ticket data available
                    </TableCell>
                  </TableRow>
                ) : (
                  analytics.branches.map((b) => (
                    <TableRow key={b.name}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="font-medium">{b.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{b.totalTickets}</TableCell>
                      <TableCell className="text-center">{b.completed}</TableCell>
                      <TableCell className="text-center">{b.waiting}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}