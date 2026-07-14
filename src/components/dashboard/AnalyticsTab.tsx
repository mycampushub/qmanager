'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Hash, CheckCircle2, Clock, Timer, TrendingUp, SkipForward,
  Loader2, RefreshCw, Download, Users, Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { AnalyticsData } from '@/lib/types';

interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalServed: number;
  totalSkipped: number;
  avgServiceTimeSec: number;
  avgWaitTimeSec: number;
  todayServed: number;
  currentlyServing: boolean;
}

export function AnalyticsTab({ tenantId }: { tenantId: string }) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [agentPerf, setAgentPerf] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [perfLoading, setPerfLoading] = useState(true);
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

  const fetchAgentPerformance = useCallback(async () => {
    try {
      setPerfLoading(true);
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/staff/performance?tenantId=${tenantId}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setAgentPerf(Array.isArray(data.agents) ? data.agents : []);
    } catch {
      toast.error('Failed to load agent performance');
    } finally {
      setPerfLoading(false);
    }
  }, [tenantId, authToken]);

  useEffect(() => {
    fetchAnalytics();
    fetchAgentPerformance();
  }, [fetchAnalytics, fetchAgentPerformance]);

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

  const handleRefreshAll = () => {
    fetchAnalytics();
    fetchAgentPerformance();
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

  const formatDuration = (secs: number) => {
    if (secs <= 0) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => handleAnalyticsExport('csv')} disabled={exportLoading} aria-label="Export analytics as CSV">
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline ml-1">CSV</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAnalyticsExport('json')} disabled={exportLoading} aria-label="Export analytics as JSON">
            {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline ml-1">JSON</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefreshAll} aria-label="Refresh analytics">
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="px-3 py-3 sm:px-4 sm:py-4">
              <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color} mb-1`} />
              <p className="text-lg sm:text-xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agent Performance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm sm:text-base">Agent Performance</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchAgentPerformance} disabled={perfLoading} aria-label="Refresh agent performance" className="min-w-[44px] min-h-[44px]">
              <RefreshCw className={`w-3.5 h-3.5 ${perfLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {perfLoading && agentPerf.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : agentPerf.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No agent performance data available.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="min-w-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px]">Agent</TableHead>
                      <TableHead className="text-[11px] text-center">Status</TableHead>
                      <TableHead className="text-[11px] text-center">Today</TableHead>
                      <TableHead className="text-[11px] text-center">Total Served</TableHead>
                      <TableHead className="text-[11px] text-center">Total Skipped</TableHead>
                      <TableHead className="text-[11px] text-center">Avg Service</TableHead>
                      <TableHead className="text-[11px] text-center">Avg Wait</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentPerf.map((agent) => (
                      <TableRow key={agent.agentId}>
                        <TableCell className="font-medium text-xs">{agent.agentName}</TableCell>
                        <TableCell className="text-center text-xs">
                          {agent.currentlyServing ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] sm:text-xs">
                              <Activity className="w-3 h-3 mr-1" /> Serving
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">Idle</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          <span className={agent.todayServed > 0 ? 'font-semibold text-emerald-600' : 'text-muted-foreground'}>
                            {agent.todayServed}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          <span className="font-semibold">{agent.totalServed}</span>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          <span className={agent.totalSkipped > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                            {agent.totalSkipped}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {formatDuration(agent.avgServiceTimeSec)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {formatDuration(agent.avgWaitTimeSec)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue Performance + Recent Activity */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm sm:text-base">Queue Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="min-w-[500px]">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 font-medium text-[11px] sm:text-xs">Queue</th>
                        <th className="pb-2 font-medium text-[11px] sm:text-xs text-center">Waiting</th>
                        <th className="pb-2 font-medium text-[11px] sm:text-xs text-center">Serving</th>
                        <th className="pb-2 font-medium text-[11px] sm:text-xs text-center">Completed</th>
                        <th className="pb-2 font-medium text-[11px] sm:text-xs text-center">Avg Service</th>
                        <th className="pb-2 font-medium text-[11px] sm:text-xs text-center">EWT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.queueStats.map((qs) => (
                        <tr key={qs.queueId} className="border-b last:border-0">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[10px] sm:text-xs">{qs.prefix}</Badge>
                              {qs.queueName}
                            </div>
                          </td>
                          <td className="py-3 text-center text-xs"><span className={qs.waiting > 5 ? 'text-amber-600 font-semibold' : ''}>{qs.waiting}</span></td>
                          <td className="py-3 text-center text-emerald-600 font-medium text-xs">{qs.serving}</td>
                          <td className="py-3 text-center text-xs">{qs.completed}</td>
                          <td className="py-3 text-center font-mono text-xs">{Math.floor(qs.avgServiceTime / 60)}m {qs.avgServiceTime % 60}s</td>
                          <td className="py-3 text-center font-mono text-xs">{qs.ewt > 0 ? `${Math.ceil(qs.ewt / 60)}m` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm sm:text-base">Recent Activity</CardTitle>
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
                      <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2 sm:py-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Badge variant="outline" className={`text-[10px] sm:text-xs shrink-0 ${typeColors[item.type] || ''}`}>
                            {item.type}
                          </Badge>
                          <span className="font-mono text-xs sm:text-sm font-medium truncate">{item.ticketSerial}</span>
                          <span className="text-xs sm:text-sm truncate min-w-0">{item.customerName}</span>
                        </div>
                        <span className="text-[10px] sm:text-xs text-muted-foreground sm:ml-auto whitespace-nowrap pl-7 sm:pl-0">
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