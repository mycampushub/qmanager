'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Plus, Clock, CheckCircle2, SkipForward, XCircle,
  ListOrdered, RefreshCw, UserPlus, Printer, Undo2, ArrowLeftRight, StickyNote
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
import { useQueueWebSocket } from '@/hooks/use-queue-ws';
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
  const [recentlyCalled, setRecentlyCalled] = useState<Ticket | null>(null);
  const [ticketListTab, setTicketListTab] = useState<'waiting' | 'served' | 'skipped'>('waiting');
  const [skippedAvailable, setSkippedAvailable] = useState(0);
  const [recallNumber, setRecallNumber] = useState('');
  const [showRecallDialog, setShowRecallDialog] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [ticketList, setTicketList] = useState<Ticket[]>([]);
  const [ticketListLoading, setTicketListLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const authToken = useAppStore((s) => s.authToken);

  const queues = tenantData?.queues?.filter(q => q.isActive) || [];
  const selectedQueue = queues.find(q => q.id === selectedQueueId);

  // Sync skippedAvailable from queue data on switch/load
  useEffect(() => {
    if (selectedQueue) {
      setSkippedAvailable(selectedQueue._skippedCount ?? 0);
    }
  }, [selectedQueue?.id, selectedQueue?._skippedCount]);

  useEffect(() => {
    if (queues.length > 0 && !selectedQueueId) {
      setSelectedQueueId(queues[0].id);
    }
  }, [queues, selectedQueueId]);

  useEffect(() => {
    if (currentTicket?.servedAt) {
      const start = new Date(currentTicket.servedAt).getTime();
      timerRef.current = setInterval(() => {
        setServingTime(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [currentTicket]);

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
  const fetchTicketList = useCallback(async (tab: string) => {
    if (!selectedQueueId || !authToken) return;
    setTicketListLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
      const statusMap: Record<string, string> = { waiting: 'WAITING', served: 'COMPLETED', skipped: 'SKIPPED' };
      const status = statusMap[tab] || 'WAITING';
      const res = await fetch('/api/tickets/list', {
        method: 'POST',
        headers,
        body: JSON.stringify({ queueId: selectedQueueId, status }),
      });
      if (res.ok) {
        const data = await res.json();
        setTicketList((data.tickets ?? []) as Ticket[]);
      }
    } catch { /* silent */ }
    finally { setTicketListLoading(false); }
  }, [selectedQueueId, authToken]);

  useEffect(() => {
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

  const { lastEvent, clearLastEvent } = useQueueWebSocket(user.tenantId, authToken ?? undefined);
  useEffect(() => {
    if (lastEvent?.event === 'TICKET_CALLED' || lastEvent?.event === 'TICKET_COMPLETED' || lastEvent?.event === 'TICKET_SKIPPED' || lastEvent?.event === 'TICKET_RECALLED') {
      enhancedRefresh();
      clearLastEvent();
    }
  }, [lastEvent, enhancedRefresh, clearLastEvent]);

  const handleCallNext = async () => {
    if (!selectedQueueId || callingNext) return;
    setCallingNext(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tickets/call', {
        method: 'POST',
        headers,
        body: JSON.stringify({ queueId: selectedQueueId, agentId: user.id }),
      });
      const data = await res.json();
      if (data.calledTicket) {
        setCurrentTicket(data.calledTicket);
        setServingTime(0);
        setRecentlyCalled(data.calledTicket);
        setTimeout(() => setRecentlyCalled(null), 3000);
        toast.success(`Now serving ${data.calledTicket._formattedSerial}`);
        enhancedRefresh();
      } else {
        toast.info('No waiting tickets in this queue');
      }
    } catch {
      toast.error('Failed to call next ticket');
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
      toast.success(`Ticket ${currentTicket._formattedSerial} completed`);
      setCurrentTicket(null);
      setServingTime(0);
      enhancedRefresh();
    } catch {
      toast.error('Failed to complete ticket');
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
      toast.info(`Ticket ${currentTicket._formattedSerial} skipped (no charge)`);
      setCurrentTicket(null);
      setServingTime(0);
      if (data.skippedAvailable !== undefined) setSkippedAvailable(data.skippedAvailable);
      enhancedRefresh();
    } catch {
      toast.error('Failed to skip ticket');
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
      toast.error('Failed to recall ticket');
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
      toast.info(`Ticket ${currentTicket._formattedSerial} cancelled`);
      setCurrentTicket(null);
      setServingTime(0);
      enhancedRefresh();
    } catch {
      toast.error('Failed to cancel ticket');
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
      // Send client timezone so server can check service windows in local time
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Queue Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Select Queue</Label>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {queues.map((q) => {
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
                      {q._waitingCount || 0} waiting
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
          {queues.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No active queues</p>
          )}
        </div>
      </div>

      {/* Walk-in Form (expandable) */}
      <AnimatePresence>
        {showWalkIn && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Customer Name *</Label>
                      <Input placeholder="Enter customer name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} disabled={walkInLoading} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Phone (optional)</Label>
                      <Input placeholder="+880..." value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} disabled={walkInLoading} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes (optional)</Label>
                    <Textarea
                      placeholder="Add a note about this customer (purpose, preference, etc.)"
                      value={walkInNotes}
                      onChange={(e) => setWalkInNotes(e.target.value.slice(0, 500))}
                      disabled={walkInLoading}
                      rows={2}
                      className="resize-none text-sm"
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground text-right">{walkInNotes.length}/500</p>
                  </div>
                  <div className="flex gap-2 sm:gap-3">
                    <Button onClick={handleWalkIn} className="bg-emerald-600 hover:bg-emerald-700" disabled={!walkInName.trim() || walkInLoading}>
                      <Plus className="w-4 h-4 mr-1" /> Add
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
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      disabled={!walkInName.trim() || walkInLoading}
                    >
                      <Printer className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline-flex">Add & Print</span>
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
          <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 mr-2" /> Walk-in
        </Button>
        <Button
          onClick={handleCallNext}
          disabled={callingNext || !selectedQueueId}
          className="flex-1 h-12 sm:h-14 text-sm sm:text-base font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-200 transition-all"
        >
          <Phone className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          CALL NEXT
        </Button>
      </div>

      {/* Currently Serving Overlay */}
      <AnimatePresence mode="wait">
        {recentlyCalled && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none">
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.5, repeat: 2 }} className="bg-emerald-600 text-white px-8 py-8 sm:px-16 sm:py-12 rounded-3xl text-center shadow-2xl">
              <p className="text-lg sm:text-xl font-medium opacity-80">NOW SERVING</p>
              <p className="text-5xl sm:text-7xl font-bold mt-2">{recentlyCalled._formattedSerial}</p>
              <p className="text-lg sm:text-xl mt-2">{recentlyCalled.customerName}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Now Serving + Tickets – Side by Side */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Currently Serving / Empty State */}
        <div>
          {currentTicket ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={currentTicket.id}>
              <Card className="border-emerald-200 shadow-md" aria-live="polite">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Currently Serving</CardTitle>
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
                          <StickyNote className="w-3 h-3 shrink-0" />
                          <span className="line-clamp-2">{currentTicket.notes}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2 mt-3 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span className="text-base sm:text-lg font-mono">{formatTime(servingTime)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <Button onClick={handleComplete} className="bg-emerald-600 hover:bg-emerald-700 h-12 sm:h-14" disabled={loading}>
                      <CheckCircle2 className="w-5 h-5 sm:mr-1" /> <span className="sm:inline-flex">Complete</span>
                    </Button>
                    <Button onClick={() => setSkipConfirm(true)} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 h-12 sm:h-14" disabled={loading}>
                      <SkipForward className="w-5 h-5 sm:mr-1" /> <span className="sm:inline-flex">Skip</span>
                    </Button>
                    <Button onClick={() => setCancelConfirm(true)} variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 h-12 sm:h-14" disabled={loading}>
                      <XCircle className="w-5 h-5 sm:mr-1" /> <span className="sm:inline-flex">Cancel</span>
                    </Button>
                    <Button
                      onClick={() => currentTicket && handlePrintTicket(currentTicket)}
                      variant="outline"
                      className="border-slate-300 text-slate-700 hover:bg-slate-50 h-12 sm:h-14"
                    >
                      <Printer className="w-5 h-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Skip Confirmation Dialog */}
              <AlertDialog open={skipConfirm} onOpenChange={setSkipConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Skip Ticket</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to skip {currentTicket._formattedSerial}? The customer didn't show up. You can recall them later from the Skipped tab. No charge for skipped tickets.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSkip} disabled={loading} className="bg-amber-600 hover:bg-amber-700">Skip</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Cancel Confirmation Dialog */}
              <AlertDialog open={cancelConfirm} onOpenChange={setCancelConfirm}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Ticket</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel {currentTicket._formattedSerial}? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Go Back</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancel} disabled={loading} className="bg-red-600 hover:bg-red-700">Cancel Ticket</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </motion.div>
          ) : (
            <Card className="border-dashed border-slate-300 h-full">
              <CardContent className="py-8 sm:py-12 text-center flex items-center justify-center h-full">
                <div className="text-muted-foreground">
                  <ListOrdered className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg">No ticket currently being served</p>
                  <p className="text-sm mt-1">Click &quot;CALL NEXT&quot; to serve the next customer</p>
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
                <AlertDialogCancel disabled={recalling}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleRecall(undefined, parseInt(recallNumber))} disabled={!recallNumber || recalling} className="bg-emerald-600 hover:bg-emerald-700">
                  {recalling ? 'Recalling...' : 'Recall Ticket'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Ticket List – Waiting / Served */}
        <div className="h-full">
          {selectedQueueId && (
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tickets</CardTitle>
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
                      {tab === 'skipped' ? `Skipped${skippedAvailable > 0 ? ` (${skippedAvailable})` : ''}` : `${tab.charAt(0).toUpperCase() + tab.slice(1)} (${ticketListTab === tab ? ticketList.length : '—'})`}
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
                {ticketListTab === 'waiting' ? 'No tickets waiting' : ticketListTab === 'skipped' ? 'No skipped tickets' : 'No served tickets yet'}
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
                            <CheckCircle2 className="w-3 h-3 mr-0.5" /> Served
                          </Badge>
                        ) : ticketListTab === 'skipped' ? (
                          <Badge variant="outline" className="mt-1 text-orange-600 border-orange-200 bg-orange-50 text-[10px]">
                            <SkipForward className="w-3 h-3 mr-0.5" /> Skipped
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="mt-1 text-amber-600 border-amber-200 bg-amber-50 text-[10px]">
                            <Clock className="w-3 h-3 mr-0.5" /> Waiting
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Queue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{selectedQueue.nowServingSerial}</p>
                <p className="text-xs text-muted-foreground mt-1">Now Serving</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{selectedQueue._waitingCount || 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Waiting</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600 cursor-pointer hover:text-orange-700 transition-colors" onClick={() => { setTicketListTab('skipped'); }}>
                  {skippedAvailable}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Skipped</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{selectedQueue._ewt ? Math.ceil(selectedQueue._ewt / 60) : 0}<span className="text-sm font-normal"> min</span></p>
                <p className="text-xs text-muted-foreground mt-1">Est. Wait</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}