'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Hash, CheckCircle2, Clock, Timer, TrendingUp, SkipForward,
  Loader2, RefreshCw, Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { AnalyticsData } from '@/lib/types';

export function AnalyticsTab({ tenantId }: { tenantId: string }) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const authToken = useAppStore((s) => s.authToken);

  const fetchAnalytics = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/tenants/analytics?tenantId=${tenantId}`, { headers });
      const data = await res.json();
      setAnalytics(data);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [tenantId, authToken]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const handleAnalyticsExport = async (format: 'csv' | 'json') => {
    setExportLoading(true);
    try {
      const headers: Record<string, string> = { 'Authorization': `Bearer ${authToken}` };
      const res = await fetch(`/api/tenants/analytics/export?tenantId=${tenantId}&format=${format}`, { headers });
      if (format === 'csv' && res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
        toast.success('CSV exported');
      } else if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `analytics-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
        toast.success('JSON exported');
      } else { toast.error('Export failed'); }
    } catch { toast.error('Export failed'); }
    finally { setExportLoading(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!analytics) return null;

  const stats = [
    { label: "Today's Tickets", value: analytics.totalTickets, icon: Hash, color: 'text-emerald-600' },
    { label: 'Completed', value: analytics.completedToday, icon: CheckCircle2, color: 'text-green-600' },
    { label: 'Avg Wait', value: `${Math.floor(analytics.avgWaitTimeSec / 60)}m ${analytics.avgWaitTimeSec % 60}s`, icon: Clock, color: 'text-amber-600' },
    { label: 'Avg Service', value: `${Math.floor(analytics.avgServiceTimeSec / 60)}m ${analytics.avgServiceTimeSec % 60}s`, icon: Timer, color: 'text-teal-600' },
    { label: 'Peak Hour', value: analytics.peakHour, icon: TrendingUp, color: 'text-rose-600' },
    { label: 'Skipped', value: analytics.skippedToday, icon: SkipForward, color: 'text-gray-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleAnalyticsExport('csv')} disabled={exportLoading} aria-label="Export analytics as CSV">
            {exportLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />} CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAnalyticsExport('json')} disabled={exportLoading} aria-label="Export analytics as JSON">
            {exportLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />} JSON
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAnalytics} aria-label="Refresh analytics">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-4 px-4">
              <stat.icon className={`w-5 h-5 ${stat.color} mb-1`} />
              <p className="text-xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Queue Performance + Recent Activity */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Queue Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Queue</th>
                      <th className="pb-2 font-medium text-center">Waiting</th>
                      <th className="pb-2 font-medium text-center">Serving</th>
                      <th className="pb-2 font-medium text-center">Completed</th>
                      <th className="pb-2 font-medium text-center">Avg Service</th>
                      <th className="pb-2 font-medium text-center">EWT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.queueStats.map((qs) => (
                      <tr key={qs.queueId} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">{qs.prefix}</Badge>
                            {qs.queueName}
                          </div>
                        </td>
                        <td className="py-3 text-center"><span className={qs.waiting > 5 ? 'text-amber-600 font-semibold' : ''}>{qs.waiting}</span></td>
                        <td className="py-3 text-center text-emerald-600 font-medium">{qs.serving}</td>
                        <td className="py-3 text-center">{qs.completed}</td>
                        <td className="py-3 text-center font-mono">{Math.floor(qs.avgServiceTime / 60)}m {qs.avgServiceTime % 60}s</td>
                        <td className="py-3 text-center font-mono">{qs.ewt > 0 ? `${Math.ceil(qs.ewt / 60)}m` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-72">
                <div className="space-y-3">
                  {analytics.recentActivity.map((item) => {
                    const typeColors: Record<string, string> = {
                      JOINED: 'bg-blue-50 text-blue-700 border-blue-200',
                      CALLED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      COMPLETED: 'bg-green-50 text-green-700 border-green-200',
                      SKIPPED: 'bg-amber-50 text-amber-700 border-amber-200',
                      CANCELLED: 'bg-red-50 text-red-700 border-red-200',
                    };
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-2">
                        <Badge variant="outline" className={`text-xs ${typeColors[item.type] || ''}`}>
                          {item.type}
                        </Badge>
                        <span className="font-mono text-sm font-medium">{item.ticketSerial}</span>
                        <span className="text-sm truncate">{item.customerName}</span>
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}