'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Star, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

interface FeedbackItem {
  id: string;
  ticketId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  ticket: { customerName: string; _formattedSerial?: string };
}

function Stars({ rating, size = 'sm' }: { rating: number; size?: string }) {
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`${cls} ${s <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
      ))}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FeedbackTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgRating, setAvgRating] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [distribution, setDistribution] = useState<number[]>([0, 0, 0, 0, 0]);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/feedback?tenantId=${tenantId}&limit=100`;
      const now = new Date();
      if (filter === 'today') { const d = now.toISOString().slice(0, 10); url += `&from=${d}&to=${d}`; }
      else if (filter === 'week') { const from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10); url += `&from=${from}&to=${now.toISOString().slice(0, 10)}`; }
      else if (filter === 'month') { const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); url += `&from=${from}&to=${now.toISOString().slice(0, 10)}`; }

      const res = await fetch(url, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) {
        setFeedbacks(Array.isArray(data.feedbacks) ? data.feedbacks : []);
        setAvgRating(data.avgRating ?? 0);
        setTotal(data.total ?? 0);
        const dist = [0, 0, 0, 0, 0];
        (data.feedbacks || []).forEach((f: FeedbackItem) => { if (f.rating >= 1 && f.rating <= 5) dist[f.rating - 1]++; });
        setDistribution(dist);
      }
    } catch { toast.error('Failed to load feedback'); }
    finally { setLoading(false); }
  }, [tenantId, filter, authHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const npsEstimate = Math.round(((distribution[4] + distribution[3]) / Math.max(feedbacks.length, 1)) * 100);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Customer Feedback</h2>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl sm:text-3xl font-bold text-amber-500">{avgRating.toFixed(1)}</p><Stars rating={Math.round(avgRating)} size="md" /><p className="text-xs text-muted-foreground mt-1">Avg Rating</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-3xl font-bold">{total}</p><p className="text-xs text-muted-foreground mt-1">Total Reviews</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-3xl font-bold text-emerald-600">{feedbacks.length}</p><p className="text-xs text-muted-foreground mt-1">In Period</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-3xl font-bold text-blue-600">{npsEstimate}%</p><p className="text-xs text-muted-foreground mt-1">Positive Rating</p></CardContent></Card>
      </div>

      {/* Rating Distribution + Recent Reviews */}
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base">Rating Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = distribution[star - 1];
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <span className="text-sm w-6 text-right">{star}</span>
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3"><CardTitle className="text-base">Recent Reviews</CardTitle></CardHeader>
            <CardContent>
              {feedbacks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No feedback yet. Customers can rate after their service is completed.</p>
              ) : (
                <ScrollArea className="h-72">
                  <div className="space-y-3">
                    {feedbacks.map((f) => (
                      <div key={f.id} className="flex items-start gap-3 p-3 rounded-lg border">
                        <div className="mt-0.5"><Stars rating={f.rating} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{f.ticket?.customerName || 'Anonymous'}</span>
                              {f.ticket?._formattedSerial && <Badge variant="outline" className="text-xs">{f.ticket._formattedSerial}</Badge>}
                            </div>
                            <span className="text-xs text-muted-foreground mt-1 sm:mt-0 sm:ml-auto">{timeAgo(f.createdAt)}</span>
                          </div>
                          {f.comment && <p className="text-sm text-muted-foreground mt-1">{f.comment}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}