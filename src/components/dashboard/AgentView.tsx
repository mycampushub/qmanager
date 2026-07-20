'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Plus, Clock, CheckCircle2, SkipForward, XCircle,
  ListOrdered, RefreshCw, UserPlus, Printer, Undo2, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { useQueueEvents } from '@/hooks/use-queue-events';
import { useLocale } from '@/lib/i18n';
import { announceTicket } from '@/lib/voice';
import type { StaffUser, Queue, Ticket } from '@/lib/types';
import { printTicket } from '@/lib/print-ticket';

export function AgentView({ user, tenantData, tenantName, onRefresh }: { user: StaffUser; tenantData: { queues: Queue[] } | null; tenantName: string; onRefresh: () => void }) {
  const [selectedQueueId, setSelectedQueueId] = useState<string>('');
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [servingTime, setServingTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [callingNext, setCallingNext] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInNotes, setWalkInNotes] = useState('');
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [ticketListTab, setTicketListTab] = useState<'waiting' | 'served' | 'skipped'>('waiting');
  const [skippedAvailable, setSkippedAvailable] = useState(0);
  const [recallNumber, setRecallNumber] = useState('');
  const [showRecallDialog, setShowRecallDialog] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [ticketList, setTicketList] = useState<Ticket[]>([]);
  const [ticketListLoading, setTicketListLoading] = useState(false);
  const [ticketListHasMore, setTicketListHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [overviewDate, setOverviewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [agentQueues, setAgentQueues] = useState<Queue[]>([]);
  const [activeBreaks, setActiveBreaks] = useState<{ id: string; reason: string; level: string; queueId?: string | null; queueName?: string | null }[]>([]);
  const [endingBreakId, setEndingBreakId] = useState<string | null>(null);
  const [counters, setCounters] = useState<{ id: string; name: string }[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string | undefined>(undefined);
  const ticketListCursorRef = useRef<number | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const authToken = useAppStore((s) => s.authToken);
  const { locale, setLocale, t: tr } = useLocale();

  const queues = (user.role === 'AGENT' ? agentQueues : tenantData?.queues?.filter(q => q.isActive) || []);
  const selectedQueue = queues.find(q => q.id === selectedQueueId);

  // Fetch agent-specific queues (with assignment filtering) from /api/queues
  useEffect(() => {
    if (!authToken || user.role !== 'AGENT') return;
    (async () => {
      try {
        const res = await fetch('/api/queues', {
          headers: { 'Authorization': `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAgentQueues((data.queues ?? []) as Queue[]);
        }
      } catch { /* silent - fallback to tenantData.queues */ }
    })();
  }, [authToken, user.role]);

  // Fetch active breaks every 30 seconds
  useEffect(() => {
    const fetchBreaks = async () => {
      try {
        const headers: Record<string, string> = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch(`/api/breaks?tenantId=${user.tenantId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          const active = (data.breaks ?? []).filter((b: { isActive: boolean }) => b.isActive);
          setActiveBreaks(active.map((b: Record<string, unknown>) => ({
            id: b.id as string,
            reason: (b.reason as string) || 'Break',
            level: b.level as string,
            queueId: b.queueId as string | null,
            queueName: b._queueName as string | null,
          })));
        }
      } catch { /* silent */ }
    };
    fetchBreaks();
    const interval = setInterval(fetchBreaks, 30000);
    return () => clearInterval(interval);
  }, [authToken, user.tenantId]);

  // Fetch counters when queue changes
  useEffect(() => {
    if (!selectedQueueId || !authToken) { setCounters([]); setSelectedCounterId(undefined); return; }
    (async () => {
      try {
        const res = await fetch(`/api/counters?queueId=${selectedQueueId}`, {
          headers: { 'Authorization': `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          const c = (data.counters ?? []) as { id: string; name: string; isActive: boolean }[];
          setCounters(c.filter(x => x.isActive));
          setSelectedCounterId(undefined);
        }
      } catch { /* silent */ }
    })();
  }, [selectedQueueId, authToken]);

  // Sync skippedAvailable from queue data on switch/load
  useEffect(() => {
    if (selectedQueue) {
      setSkippedAvailable(selectedQueue._skippedCount ?? 0);
    }
  }, [selectedQueue?.id, selectedQueue?._skippedCount]);

  useEffect(() => { if (queues.length > 0 && !selectedQueueId) setSelectedQueueId(queues[0].id); }, [queues, selectedQueueId]);

  useEffect(() => {
    if (currentTicket?.servedAt) {
      const start = new Date(currentTicket.servedAt).getTime();
      timerRef.current = setInterval(() => {
        setServingTime(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
    setServingTime(0);
  }, [currentTicket?.id, currentTicket?.servedAt]);

  // F1: Auto-detect currently serving ticket on queue switch / login
  useEffect(() => {
    if (!selectedQueueId || !authToken) return;
    (async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
        const res = await fetch('/api/tickets/status', {
          method: 'POST',
          headers,
          body: JSON.stringify({ queueId: selectedQueueId, status: 'SERVING' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ticket) {
            setCurrentTicket(data.ticket as Ticket);
          }
        }
      } catch { /* silent */ }
    })();
  }, [selectedQueueId, authToken]);

  // Fetch ticket list (waiting or served) for selected queue
  const fetchTicketList = useCallback(async (tab: string, append: boolean = false) => {
    if (!selectedQueueId || !authToken) return;
    if (append) setLoadingMore(true); else setTicketListLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
      const statusMap: Record<string, string> = { waiting: 'WAITING', served: 'COMPLETED', skipped: 'SKIPPED' };
      const status = statusMap[tab] || 'WAITING';
      const cursor = append ? ticketListCursorRef.current : undefined;
      const res = await fetch('/api/tickets/list', {
        method: 'POST',
        headers,
        body: JSON.stringify({ queueId: selectedQueueId, status, limit: 20, cursor }),
      });
      if (res.ok) {
        const data = await res.json();
        const newTickets = (data.tickets ?? []) as Ticket[];
        if (append && newTickets.length > 0) {
          ticketListCursorRef.current = newTickets[newTickets.length - 1].serialNumber;
          setTicketList(prev => [...prev, ...newTickets]);
        } else {
          ticketListCursorRef.current = undefined;
          setTicketList(newTickets);
        }
        setTicketListHasMore(data.hasMore ?? false);
      }
    } catch { /* silent */ }
    finally { if (append) setLoadingMore(false); else setTicketListLoading(false); }
  }, [selectedQueueId, authToken]);

  useEffect(() => {
    setTicketListHasMore(false);
    fetchTicketList(ticketListTab);
  }, [ticketListTab, fetchTicketList, selectedQueueId]);

  // Re-fetch ticket list when a ticket action happens
  const lastRefreshRef = useRef(0);
  const originalOnRefresh = onRefresh;
  const enhancedRefresh = useCallback(() => {
    originalOnRefresh();
    const now = Date.now();
    if (now - lastRefreshRef.current > 500) {
      lastRefreshRef.current = now;
      fetchTicketList(ticketListTab);
    }
  }, [originalOnRefresh, fetchTicketList, ticketListTab]);

  const { lastEvent, clearLastEvent, pushEvent } = useQueueEvents(user.tenantId);
  useEffect(() => {
    if (lastEvent?.type === 'TICKET_CALLED' || lastEvent?.type === 'TICKET_COMPLETED' || lastEvent?.type === 'TICKET_SKIPPED' || lastEvent?.type === 'TICKET_RECALLED') {
      enhancedRefresh();
      clearLastEvent();
    }
  }, [lastEvent, enhancedRefresh, clearLastEvent]);

  // Determine if the selected queue is blocked by an active break
  const isBreakActiveForQueue = activeBreaks.some((b) => {
    if (b.level === 'ROOM') return true;
    if (b.level === 'LINE' && b.queueId === selectedQueueId) return true;
    return false;
  });

  const handleCallNext = async () => {
    if (!selectedQueueId || callingNext) return;
    setCallingNext(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tickets/call', {
        method: 'POST',
        headers,
        body: JSON.stringify({ queueId: selectedQueueId, agentId: user.id, counterId: selectedCounterId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || tr('common.error'));
        return;
      }
      if (data.calledTicket) {
        const calledTicket = data.calledTicket;
        setCurrentTicket(calledTicket);
        setServingTime(0);
        toast.success(`${tr('ticket.nowServing')} ${calledTicket._formattedSerial}`);
        enhancedRefresh();

        // Voice announcement for the agent
        if (selectedQueue) {
          announceTicket({
            serial: calledTicket._formattedSerial,
            queueName: selectedQueue.name,
            locale,
            customerName: calledTicket.customerName,
          });
        }
      } else {
        toast.info(tr('ticket.noTickets'));
      }
    } catch {
      toast.error(tr('common.error'));
    } finally {
      setCallingNext(false);
    }
  };

  const handleComplete = async () => {
    if (!currentTicket) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tickets/complete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ticketId: currentTicket.id, agentId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to complete ticket'); return; }
      toast.success(`Ticket ${currentTicket._formattedSerial} ${tr('status.COMPLETED').toLowerCase()}`);
      setCurrentTicket(null);
      setServingTime(0);
      enhancedRefresh();
    } catch {
      toast.error(tr('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const [walkInLoading, setWalkInLoading] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const handleSkip = async () => {
    if (!currentTicket) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tickets/skip', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ticketId: currentTicket.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to skip ticket'); return; }
      toast.info(`Ticket ${currentTicket._formattedSerial} ${tr('status.SKIPPED').toLowerCase()} (no charge)`);
      setCurrentTicket(null);
      setServingTime(0);
      if (data.skippedAvailable !== undefined) setSkippedAvailable(data.skippedAvailable);
      enhancedRefresh();
    } catch {
      toast.error(tr('common.error'));
    } finally {
      setLoading(false);
      setSkipConfirm(false);
    }
  };

  const handleRecall = async (ticketId?: string, serialNumber?: number) => {
    if (!selectedQueueId) return;
    setRecalling(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const body: Record<string, unknown> = { queueId: selectedQueueId };
      if (ticketId) body.ticketId = ticketId;
      if (serialNumber) body.serialNumber = serialNumber;
      const res = await fetch('/api/tickets/recall', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to recall ticket'); return; }
      toast.success(`Ticket ${data.ticket._formattedSerial} recalled`);
      setCurrentTicket(data.ticket);
      setServingTime(0);
      if (data.skippedAvailable !== undefined) setSkippedAvailable(data.skippedAvailable);
      setTicketListTab('waiting');
      setShowRecallDialog(false);
      setRecallNumber('');
      enhancedRefresh();
    } catch {
      toast.error(tr('common.error'));
    } finally {
      setRecalling(false);
    }
  };

  const handleCancel = async () => {
    if (!currentTicket) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tickets/cancel', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ticketId: currentTicket.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to cancel ticket'); return; }
      toast.info(`Ticket ${currentTicket._formattedSerial} ${tr('status.CANCELLED').toLowerCase()}`);
      setCurrentTicket(null);
      setServingTime(0);
      enhancedRefresh();
    } catch {
      toast.error(tr('common.error'));
    } finally {
      setLoading(false);
      setCancelConfirm(false);
    }
  };

  const handleWalkIn = async () => {
    if (!walkInName.trim() || !selectedQueueId) return;
    setWalkInLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      try { headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }
      const res = await fetch('/api/queues/join', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId: user.tenantId,
          queueId: selectedQueueId,
          customerName: walkInName.trim(),
          customerPhone: walkInPhone.trim() || undefined,
          notes: walkInNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Ticket ${data.ticket._formattedSerial} created for ${walkInName}`);
        setWalkInName('');
        setWalkInPhone('');
        setWalkInNotes('');
        setShowWalkIn(false);
        enhancedRefresh();
      } else {
        toast.error(data.error || 'Failed to create ticket');
      }
    } catch {
      toast.error('Failed to create walk-in ticket');
    } finally {
      setWalkInLoading(false);
    }
  };

  // ── Thermal print helper ─────────────────────────────────────
  const handlePrintTicket = useCallback(
    (t: Ticket) => {
      const q = queues.find((q) => q.id === t.queueId);
      if (!q) return;
      printTicket({
        ticket: t,
        queue: q,
        tenantName,
        peopleAhead: t._peopleAhead,
        ewtSeconds: t._ewt,
      });
    },
    [queues, tenantName],
  );

  // Group queues by location name
  const allLocationNames = [...new Set(queues.map(q => q.location?.name || 'General'))];
  const [activeLocationFilter, setActiveLocationFilter] = useState<string>('all');
  const filteredQueues = activeLocationFilter === 'all' ? queues : queues.filter(q => (q.location?.name || 'General') === activeLocationFilter);
  const groupedQueues = filteredQueues.reduce<Record<string, typeof queues>>((acc, q) => {
    const tag = q.location?.name || 'General';
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(q);
    return acc;
  }, {});
  const locationTags = Object.keys(groupedQueues).sort((a, b) => {
    if (a === 'General') return 1;
    if (b === 'General') return -1;
    return a.localeCompare(b);
  });

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Active Break Banner */}
      {activeBreaks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-amber-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">⚠️</span>
            <span className="text-sm font-medium truncate">
              {activeBreaks.length === 1
                ? `${activeBreaks[0].level} break${activeBreaks[0].queueName ? ` — ${activeBreaks[0].queueName}` : ''}: ${activeBreaks[0].reason}`
                : `${activeBreaks.length} active breaks`}
              {isBreakActiveForQueue && selectedQueueId && ' — Call Next is disabled'}
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            {activeBreaks.map((b) => (
              <Button
                key={b.id}
                size="sm"
                variant="outline"
                disabled={endingBreakId === b.id}
                className="border-amber-300 text-amber-800 hover:bg-amber-100 text-xs"
                onClick={async () => {
                  setEndingBreakId(b.id);
                  try {
                    const res = await fetch('/api/breaks', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                      body: JSON.stringify({ breakId: b.id }),
                    });
                    if (res.ok) {
                      setActiveBreaks(prev => prev.filter(x => x.id !== b.id));
                      toast.success(`Break ended (${b.level}${b.queueName ? ': ' + b.queueName : ''})`);
                      onRefresh();
                    } else {
                      const err = await res.json().catch(() => ({}));
                      toast.error((err as Record<string, string>).error || 'Failed to end break');
                    }
                  } catch { toast.error('Failed to end break'); }
                  finally { setEndingBreakId(null); }
                }}
              >
                {endingBreakId === b.id ? 'Ending…' : 'End Break'}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Queue Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{tr('queue.select')}</Label>
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
              className="h-8 px-2 gap-1 text-muted-foreground hover:text-foreground"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="text-xs">{locale === 'en' ? 'বাংলা' : 'EN'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4 mr-1" /> {tr('common.refresh')}
            </Button>
          </div>
        </div>
        {/* Location Filter Tabs */}
        {allLocationNames.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveLocationFilter('all')}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeLocationFilter === 'all'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              All
            </button>
            {allLocationNames.map(loc => (
              <button
                key={loc}
                type="button"
                onClick={() => setActiveLocationFilter(loc)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeLocationFilter === loc
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {loc}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-3 overflow-x-auto pb-1 -mx-1 px-1">
          {locationTags.map(tag => (
            <div key={tag}>
              {locationTags.length > 1 && (
                <div className="flex items-center gap-2 py-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tag}</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
              )}
              <div className="flex gap-3">
                {groupedQueues[tag].map((q) => {
                  const isSelected = selectedQueueId === q.id;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => { setSelectedQueueId(q.id); setCurrentTicket(null); setServingTime(0); }}
                      className={`flex-shrink-0 w-40 sm:w-44 rounded-xl border-2 p-2.5 sm:p-3 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                          : 'border-transparent bg-muted/40 hover:bg-muted/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${
                            isSelected ? 'bg-emerald-600' : 'bg-muted-foreground/20'
                          }`}
                        >
                          {q.prefix}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? 'text-emerald-900' : 'text-foreground'}`}>
                            {q.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {q._waitingCount || 0} {tr('time.waiting').toLowerCase()}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredQueues.length === 0 && queues.length > 0 && (
            <p className="text-sm text-muted-foreground py-4">No queues in this location</p>
          )}
          {queues.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">{tr('queue.noQueues')}</p>
          )}
        </div>
        {/* Counter Selector */}
        {counters.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Counter:</span>
            {counters.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCounterId(selectedCounterId === c.id ? undefined : c.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  selectedCounterId === c.id
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Walk-in Form — Full screen on mobile with Sheet-like behavior */}
      <AnimatePresence>
        {showWalkIn && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col gap-3">
                  {/* Mobile: stack vertically for full-width inputs */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <Label className="text-xs">{tr('walkin.customerName')}</Label>
                      <Input
                        className="h-14 sm:h-12 text-base sm:text-sm"
                        placeholder={locale === 'bn' ? 'গ্রাহকের নাম লিখুন' : 'Enter customer name'}
                        value={walkInName}
                        onChange={(e) => setWalkInName(e.target.value)}
                        disabled={walkInLoading}
                        autoFocus
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <Label className="text-xs">{tr('walkin.phone')}</Label>
                      <Input
                        className="h-14 sm:h-12 text-base sm:text-sm"
                        placeholder="+880..."
                        value={walkInPhone}
                        onChange={(e) => setWalkInPhone(e.target.value)}
                        disabled={walkInLoading}
                        type="tel"
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tr('walkin.notes')}</Label>
                    <Textarea
                      placeholder={tr('walkin.notesPlaceholder')}
                      value={walkInNotes}
                      onChange={(e) => setWalkInNotes(e.target.value.slice(0, 500))}
                      disabled={walkInLoading}
                      rows={2}
                      className="resize-none text-sm min-h-[80px]"
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground text-right">{walkInNotes.length}/500</p>
                  </div>
                  <div className="flex gap-2 sm:gap-3">
                    <Button onClick={handleWalkIn} className="bg-emerald-600 hover:bg-emerald-700 h-12 sm:h-10" disabled={!walkInName.trim() || walkInLoading}>
                      <Plus className="w-4 h-4 mr-1" /> {tr('common.add')}
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!walkInName.trim() || !selectedQueueId) return;
                        setWalkInLoading(true);
                        try {
                          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
                          try { headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }
                          const res = await fetch('/api/queues/join', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                              tenantId: user.tenantId,
                              queueId: selectedQueueId,
                              customerName: walkInName.trim(),
                              customerPhone: walkInPhone.trim() || undefined,
                              notes: walkInNotes.trim() || undefined,
                            }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            toast.success(`Ticket ${data.ticket._formattedSerial} created for ${walkInName}`);
                            setWalkInName('');
                            setWalkInPhone('');
                            setWalkInNotes('');
                            setShowWalkIn(false);
                            enhancedRefresh();
                            handlePrintTicket(data.ticket);
                          } else {
                            toast.error(data.error || 'Failed to create ticket');
                          }
                        } catch {
                          toast.error('Failed to create walk-in ticket');
                        } finally {
                          setWalkInLoading(false);
                        }
                      }}
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 h-12 sm:h-10"
                      disabled={!walkInName.trim() || walkInLoading}
                    >
                      <Printer className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline-flex">{tr('walkin.addAndPrint')}</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Walk-in + Call Next – Side by Side */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => setShowWalkIn(!showWalkIn)}
          className="flex-1 h-12 sm:h-14 text-sm sm:text-base font-semibold"
        >
          <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> {tr('ticket.walkIn')}
        </Button>
        <Button
          onClick={handleCallNext}
          disabled={callingNext || !selectedQueueId || isBreakActiveForQueue}
          className="flex-1 h-12 sm:h-14 text-sm sm:text-base font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed rounded-xl shadow-md shadow-emerald-200 transition-all"
          title={isBreakActiveForQueue ? 'Cannot call next — service is on break. End the break first.' : undefined}
        >
          <Phone className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          {isBreakActiveForQueue ? 'ON BREAK' : tr('ticket.call').toUpperCase()}
        </Button>
      </div>

      {/* Currently Serving / Empty State — NO popup overlay */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          {currentTicket ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={currentTicket.id}>
              <Card className="border-emerald-200 shadow-md" aria-live="polite">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{tr('ticket.currentlyServing')}</CardTitle>
                    <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                      {selectedQueue?.name}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <p className="text-4xl sm:text-5xl font-bold text-emerald-600">{currentTicket._formattedSerial}</p>
                    <p className="text-lg sm:text-xl text-foreground mt-2">{currentTicket.customerName}</p>
                    {currentTicket.customerPhone && (
                      <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                        <Phone className="w-3 h-3" /> {currentTicket.customerPhone}
                      </p>
                    )}
                    {currentTicket.notes && (
                      <div className="mt-2 mx-auto max-w-xs">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                          <span className="shrink-0">📝</span>
                          <span className="line-clamp-2">{currentTicket.notes}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2 mt-3 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span className="text-base sm:text-lg font-mono">{formatTime(servingTime)}</span>
                    </div>
                  </div>
                  {/* Action buttons — 3 buttons, no Print button */}
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <Button onClick={handleComplete} className="bg-emerald-600 hover:bg-emerald-700 h-12 sm:h-14" disabled={loading}>
                      <CheckCircle2 className="w-5 h-5 sm:mr-1" /> <span className="sm:inline-flex">{tr('ticket.complete')}</span>
                    </Button>
                    <Button onClick={() => setSkipConfirm(true)} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 h-12 sm:h-14" disabled={loading}>
                      <SkipForward className="w-5 h-5 sm:mr-1" /> <span className="sm:inline-flex">{tr('ticket.skip')}</span>
                    </Button>
                    <Button onClick={() => setCancelConfirm(true)} variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 h-12 sm:h-14" disabled={loading}>
                      <XCircle className="w-5 h-5 sm:mr-1" /> <span className="sm:inline-flex">{tr('ticket.cancel')}</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Skip Confirmation Dialog */}
              <AlertDialog open={skipConfirm} onOpenChange={setSkipConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{tr('ticket.skip')} Ticket</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to skip {currentTicket._formattedSerial}? The customer didn't show up. You can recall them later from the Skipped tab. No charge for skipped tickets.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>{tr('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSkip} disabled={loading} className="bg-amber-600 hover:bg-amber-700">{tr('ticket.skip')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Cancel Confirmation Dialog */}
              <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{tr('ticket.cancel')} Ticket</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel {currentTicket._formattedSerial}? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Go Back</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancel} disabled={loading} className="bg-red-600 hover:bg-red-700">{tr('ticket.cancel')} Ticket</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </motion.div>
          ) : (
            <Card className="border-dashed border-slate-300 h-full">
              <CardContent className="py-8 sm:py-12 text-center flex items-center justify-center h-full">
                <div className="text-muted-foreground">
                  <ListOrdered className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg">{tr('ticket.noServing')}</p>
                  <p className="text-sm mt-1">{tr('ticket.callNextHint')}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recall by Number Dialog */}
          <AlertDialog open={showRecallDialog} onOpenChange={setShowRecallDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Recall Skipped Ticket</AlertDialogTitle>
                <AlertDialogDescription>
                  Enter the ticket serial number to recall. The customer's previous tickets (lower serials) must already be served.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <Input
                  placeholder="Enter serial number (e.g. 5)"
                  value={recallNumber}
                  onChange={(e) => setRecallNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && recallNumber) handleRecall(undefined, parseInt(recallNumber)); }}
                  disabled={recalling}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={recalling}>{tr('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleRecall(undefined, parseInt(recallNumber))} disabled={!recallNumber || recalling} className="bg-emerald-600 hover:bg-emerald-700">
                  {recalling ? 'Recalling...' : 'Recall Ticket'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Ticket List – Waiting / Served / Skipped */}
        <div className="h-full">
          {selectedQueueId && (
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{locale === 'bn' ? 'টিকেট' : 'Tickets'}</CardTitle>
              <div className="flex items-center gap-1">
                <div className="flex bg-muted rounded-lg p-0.5">
                  {(['waiting', 'served', 'skipped'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setTicketListTab(tab)}
                      className={`px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors ${
                        ticketListTab === tab
                          ? 'bg-white text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab === 'skipped'
                        ? `${tr('ticket.skipped')}${skippedAvailable > 0 ? ` (${skippedAvailable})` : ''}`
                        : tab === 'waiting'
                        ? `${tr('ticket.waiting')} (${ticketListTab === tab ? ticketList.length : '—'})`
                        : `${tr('ticket.served')} (${ticketListTab === tab ? ticketList.length : '—'})`
                      }
                    </button>
                  ))}
                </div>
                {ticketListTab === 'skipped' && skippedAvailable > 0 && (
                  <Button variant="outline" size="sm" className="ml-1 h-7 text-xs gap-1" onClick={() => setShowRecallDialog(true)}>
                    <Undo2 className="w-3 h-3" /> <span className="hidden sm:inline-flex">Recall</span>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1 flex flex-col min-h-0">
            {ticketListLoading ? (
              <div className="space-y-2 flex-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : ticketList.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground flex-1 flex flex-col items-center justify-center">
                <ListOrdered className="w-8 h-8 mb-2 opacity-30" />
                {ticketListTab === 'waiting' ? tr('ticket.noWaiting') : ticketListTab === 'skipped' ? tr('ticket.noSkipped') : tr('ticket.noServed')}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {ticketList.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between py-2.5 px-3 rounded-lg border ${
                      ticketListTab === 'served'
                        ? 'border-green-100 bg-green-50/50'
                        : ticketListTab === 'skipped'
                        ? 'border-orange-100 bg-orange-50/50'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                        ticketListTab === 'served'
                          ? 'bg-green-100 text-green-700'
                          : ticketListTab === 'skipped'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {t._formattedSerial || `${selectedQueue?.prefix || ''}${String(t.serialNumber).padStart(3, '0')}`}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.customerName}</p>
                        {t.customerPhone && (
                          <p className="text-xs text-muted-foreground">{t.customerPhone}</p>
                        )}
                        {t.notes && (
                          <p className="text-xs text-amber-700 truncate max-w-[140px] sm:max-w-[200px]" title={t.notes}>
                            📝 {t.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {ticketListTab === 'skipped' && (
                        <button
                          type="button"
                          onClick={() => handleRecall(t.id, t.serialNumber)}
                          className="p-1.5 rounded-md hover:bg-emerald-50 transition-colors text-emerald-600 hover:text-emerald-700"
                          aria-label={`Recall ticket ${t._formattedSerial}`}
                          title="Recall ticket"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Print button only in ticket list, NOT in currently serving card */}
                      <button
                        type="button"
                        onClick={() => handlePrintTicket(t)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        aria-label={`Print ticket ${t._formattedSerial}`}
                        title="Print ticket"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <div className="text-right">
                        {ticketListTab === 'served' && t.completedAt ? (
                          <p className="text-xs text-muted-foreground">
                            {new Date(t.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        ) : t.createdAt ? (
                          <p className="text-xs text-muted-foreground">
                            {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        ) : null}
                        {ticketListTab === 'served' ? (
                          <Badge variant="outline" className="mt-1 text-green-600 border-green-200 bg-green-50 text-[10px]">
                            <CheckCircle2 className="w-3 h-3 mr-0.5" /> {tr('ticket.served')}
                          </Badge>
                        ) : ticketListTab === 'skipped' ? (
                          <Badge variant="outline" className="mt-1 text-orange-600 border-orange-200 bg-orange-50 text-[10px]">
                            <SkipForward className="w-3 h-3 mr-0.5" /> {tr('ticket.skipped')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="mt-1 text-amber-600 border-amber-200 bg-amber-50 text-[10px]">
                            <Clock className="w-3 h-3 mr-0.5" /> {tr('ticket.waiting')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {ticketListHasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 text-xs"
                    disabled={loadingMore}
                    onClick={() => fetchTicketList(ticketListTab, true)}
                  >
                    {loadingMore ? tr('ticket.loading') : tr('ticket.loadMore')}
                  </Button>
                )}
              </div>
            )}
            </CardContent>
          </Card>
          )}
        </div>
      </div>

      {/* Queue Overview – Below */}
      {selectedQueue && (
        <Card aria-live="polite">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{tr('queue.overview')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <Label className="text-xs font-medium text-muted-foreground">{tr('common.date')}:</Label>
              <Input
                type="date"
                className="h-8 w-auto text-xs"
                value={overviewDate}
                onChange={(e) => setOverviewDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                {(selectedQueue._servingCount ?? 0) > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-emerald-600">{selectedQueue.nowServingSerial}</p>
                    <p className="text-xs text-muted-foreground mt-1">{tr('ticket.nowServing')}</p>
                  </>
                ) : selectedQueue.nowServingSerial > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-gray-400">{selectedQueue.nowServingSerial}</p>
                    <p className="text-xs text-muted-foreground mt-1">Last {tr('ticket.served')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-gray-300">—</p>
                    <p className="text-xs text-muted-foreground mt-1">{tr('common.noTickets')}</p>
                  </>
                )}
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{selectedQueue._waitingCount || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{tr('ticket.waiting')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" onClick={() => { setTicketListTab('skipped'); }}>
                  {skippedAvailable}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{tr('ticket.skipped')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{selectedQueue._ewt ? Math.ceil(selectedQueue._ewt / 60) : 0}<span className="text-sm font-normal"> {tr('time.minutes')}</span></p>
                <p className="text-xs text-muted-foreground mt-1">{tr('time.estWait')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}