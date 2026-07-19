'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Pause, Play, Clock, Coffee,
  AlertTriangle, Building2, ListOrdered, MonitorDot, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { BreakPeriod, BreakLevel, ServiceCounter } from '@/lib/types';

/* ── Helpers ─────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h ago`;
}

function formatDurationMinutes(m: number): string {
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h} hour${h > 1 ? 's' : ''}`;
}

function endsAtLabel(break_: BreakPeriod): string | null {
  if (!break_.endsAt) return null;
  const remaining = new Date(break_.endsAt).getTime() - Date.now();
  if (remaining <= 0) return 'Expiring soon';
  const mins = Math.floor(remaining / 60_000);
  if (mins < 60) return `Ends in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `Ends in ${hrs}h ${mins % 60}m`;
}

const LEVEL_CONFIG: Record<BreakLevel, { label: string; color: string; bg: string; border: string; icon: typeof Building2 }> = {
  ROOM: { label: 'Room', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-300', icon: Building2 },
  LINE: { label: 'Line', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-300', icon: ListOrdered },
  COUNTER: { label: 'Counter', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-300', icon: MonitorDot },
};

const DURATION_OPTIONS = [
  { value: '0', label: 'Until manually ended' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
];

/* ── Component ───────────────────────────────────────────── */

export default function BreaksTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const authUserId = useAppStore((s) => s.authUser?.id);

  const [breaks, setBreaks] = useState<BreakPeriod[]>([]);
  const [queues, setQueues] = useState<{ id: string; name: string; prefix: string }[]>([]);
  const [counters, setCounters] = useState<ServiceCounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [endingId, setEndingId] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formLevel, setFormLevel] = useState<BreakLevel>('ROOM');
  const [formQueueId, setFormQueueId] = useState('');
  const [formCounterId, setFormCounterId] = useState('');
  const [formCounterName, setFormCounterName] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formDuration, setFormDuration] = useState('0');
  const [saving, setSaving] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Auth headers helper ──────────────────────────────── */
  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  /* ── Data fetching ────────────────────────────────────── */
  const fetchBreaks = useCallback(async () => {
    try {
      const res = await fetch(`/api/breaks?tenantId=${tenantId}`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setBreaks(Array.isArray(d.breaks) ? d.breaks : []);
      }
    } catch {
      // silent
    }
  }, [tenantId, authHeaders]);

  const fetchQueues = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        const d = await res.json();
        const list = Array.isArray(d.tenant?._queues) ? d.tenant._queues : (Array.isArray(d.queues) ? d.queues : []);
        setQueues(list.map((q: { id: string; name: string; prefix: string }) => ({ id: q.id, name: q.name, prefix: q.prefix })));
      }
    } catch {
      // silent
    }
  }, [tenantId, authHeaders]);

  const fetchCounters = useCallback(async (queueId: string) => {
    try {
      const res = await fetch(`/api/counters?queueId=${queueId}`, { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setCounters(Array.isArray(d.counters) ? d.counters : []);
      }
    } catch {
      setCounters([]);
    }
  }, [authHeaders]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchBreaks(), fetchQueues()]);
    setLoading(false);
  }, [fetchBreaks, fetchQueues]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  /* ── Auto-refresh every 10s ──────────────────────────── */
  useEffect(() => {
    intervalRef.current = setInterval(() => { fetchBreaks(); }, 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchBreaks]);

  /* ── When queue changes in dialog, reset counter ──────── */
  useEffect(() => {
    setFormCounterId('');
    setFormCounterName('');
    if (formQueueId) {
      fetchCounters(formQueueId);
    } else {
      setCounters([]);
    }
  }, [formQueueId, fetchCounters]);

  /* ── Reset form ──────────────────────────────────────── */
  const resetForm = () => {
    setFormLevel('ROOM');
    setFormQueueId('');
    setFormCounterId('');
    setFormCounterName('');
    setFormReason('');
    setFormDuration('0');
  };

  /* ── Start break ─────────────────────────────────────── */
  const handleStartBreak = async () => {
    if (formLevel === 'LINE' && !formQueueId) {
      toast.error('Please select a queue for LINE level break');
      return;
    }
    if (formLevel === 'COUNTER' && !formQueueId) {
      toast.error('Please select a queue for COUNTER level break');
      return;
    }
    if (formLevel === 'COUNTER' && !formCounterId && !formCounterName.trim()) {
      toast.error('Please select or enter a counter name');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        tenantId,
        level: formLevel,
        queueId: formLevel !== 'ROOM' ? formQueueId || null : null,
        counterId: formLevel === 'COUNTER' ? (formCounterId || null) : null,
        reason: formReason.trim() || null,
        durationMinutes: formDuration === '0' ? null : parseInt(formDuration),
      };
      // If COUNTER level and using manual name, include it
      if (formLevel === 'COUNTER' && !formCounterId && formCounterName.trim()) {
        body.counterName = formCounterName.trim();
      }
      const res = await fetch('/api/breaks', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to start break'); return; }
      toast.success('Break started successfully');
      setDialogOpen(false);
      resetForm();
      fetchBreaks();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  /* ── End break ───────────────────────────────────────── */
  const handleEndBreak = async (id: string) => {
    if (!authUserId) { toast.error('User not authenticated'); return; }
    setEndingId(id);
    try {
      const res = await fetch('/api/breaks', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ id, endedBy: authUserId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to end break'); return; }
      toast.success('Break ended successfully');
      fetchBreaks();
    } catch {
      toast.error('Network error');
    } finally {
      setEndingId(null);
    }
  };

  /* ── Loading state ───────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeCount = breaks.length;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Break Management</h2>
          {activeCount > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">
              {activeCount} active{activeCount > 1 ? ' breaks' : ' break'}
            </Badge>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" size="sm">
              <Pause className="w-4 h-4 mr-1.5" />
              Start Break
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Start a Break</DialogTitle>
              <DialogDescription>
                Pause service at the selected level. All ticket processing will be paused for the affected scope.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Level selector */}
              <div className="space-y-2">
                <Label>Break Level</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(LEVEL_CONFIG) as BreakLevel[]).map((level) => {
                    const cfg = LEVEL_CONFIG[level];
                    const Icon = cfg.icon;
                    const selected = formLevel === level;
                    return (
                      <button
                        type="button"
                        key={level}
                        onClick={() => setFormLevel(level)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                          selected
                            ? `${cfg.border} ${cfg.bg} ${cfg.color}`
                            : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Queue selector (LINE / COUNTER) */}
              {(formLevel === 'LINE' || formLevel === 'COUNTER') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Label>Queue</Label>
                  <Select value={formQueueId} onValueChange={setFormQueueId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a queue…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {queues.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.prefix} — {q.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              )}

              {/* Counter selector / name (COUNTER) */}
              {formLevel === 'COUNTER' && formQueueId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Label>Counter</Label>
                  {counters.length > 0 && (
                    <Select value={formCounterId} onValueChange={(v) => { setFormCounterId(v); setFormCounterName(''); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a counter…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {counters.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="relative">
                    <Input
                      placeholder={counters.length > 0 ? 'Or enter a custom counter name…' : 'Enter counter name…'}
                      value={formCounterName}
                      onChange={(e) => { setFormCounterName(e.target.value); setFormCounterId(''); }}
                      className={formCounterName ? 'border-blue-300' : ''}
                    />
                  </div>
                </motion.div>
              )}

              {/* Reason */}
              <div className="space-y-2">
                <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  placeholder="e.g., Lunch break, Equipment issue…"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                />
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={formDuration} onValueChange={setFormDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formDuration !== '0' && (
                  <p className="text-xs text-muted-foreground">
                    Break will auto-end after {formatDurationMinutes(parseInt(formDuration))}.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={handleStartBreak}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={saving}
              >
                {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                <Pause className="w-4 h-4 mr-1.5" />
                Start Break
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Active Breaks ───────────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {breaks.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                  <Play className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="font-medium text-emerald-800">No active breaks</p>
                <p className="text-sm text-emerald-600/80 mt-1">Service is running normally.</p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            className="space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {breaks.map((b, idx) => {
              const cfg = LEVEL_CONFIG[b.level as BreakLevel] || LEVEL_CONFIG.ROOM;
              const Icon = cfg.icon;
              const remaining = endsAtLabel(b);
              const isEnding = endingId === b.id;

              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card className={`border-l-4 ${cfg.border} hover:shadow-sm transition-shadow`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        {/* Left content */}
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                            <Icon className={`w-5 h-5 ${cfg.color}`} />
                          </div>

                          <div className="min-w-0 flex-1">
                            {/* Level + queue/counter info */}
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <Badge variant="outline" className={`${cfg.border} ${cfg.color} text-xs font-semibold`}>
                                {cfg.label}
                              </Badge>
                              {b._queueName && (
                                <span className="text-sm text-muted-foreground">
                                  {b._queueName}
                                </span>
                              )}
                              {b._counterName && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span className="text-sm font-medium text-foreground/80">
                                    {b._counterName}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Reason */}
                            {b.reason && (
                              <p className="text-sm text-foreground/90 mb-1.5 flex items-center gap-1.5">
                                <Coffee className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                {b.reason}
                              </p>
                            )}

                            {/* Timing info */}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Started {timeAgo(b.startedAt)}
                              </span>
                              {remaining && (
                                <span className={`flex items-center gap-1 ${remaining === 'Expiring soon' ? 'text-amber-600 font-medium' : ''}`}>
                                  {remaining === 'Expiring soon' && <AlertTriangle className="w-3 h-3" />}
                                  {remaining}
                                </span>
                              )}
                              {!b.endsAt && (
                                <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600 hover:bg-slate-100">
                                  Indefinite
                                </Badge>
                              )}
                              {b.endsAt && (
                                <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">
                                  {formatDurationMinutes(Math.round((new Date(b.endsAt).getTime() - new Date(b.startedAt).getTime()) / 60_000))}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* End break button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                          onClick={() => handleEndBreak(b.id)}
                          disabled={isEnding}
                        >
                          {isEnding ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                          )}
                          End Break
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active break indicator bar ──────────────────── */}
      {activeCount > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm text-amber-800 font-medium">
              {activeCount} break{activeCount > 1 ? 's' : ''} active — service is paused for affected scopes
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}