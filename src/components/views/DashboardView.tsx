'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, Users, BarChart3, Wallet, Palette, ListOrdered, UserCircle,
  Phone, Plus, ChevronRight, Clock, CheckCircle2, SkipForward, XCircle,
  TrendingUp, Timer, Hash, Activity, AlertCircle, Loader2, Menu, X,
  UserPlus, Eye, RefreshCw, UserCog, ShieldCheck, ShieldX, Pencil, Trash2, KeyRound,
  CalendarClock, Star, Webhook, Settings, Download, MoreHorizontal, Copy
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { useQueueWebSocket } from '@/hooks/use-queue-ws';
import type { StaffUser, Queue, Ticket, AnalyticsData } from '@/lib/types';
import ServiceWindowsTab from '@/components/tabs/ServiceWindowsTab';
import AppointmentsTab from '@/components/tabs/AppointmentsTab';
import FeedbackTab from '@/components/tabs/FeedbackTab';
import WebhooksTab from '@/components/tabs/WebhooksTab';
import SettingsTab from '@/components/tabs/SettingsTab';
import { QRCodeDisplay } from '@/components/QRCode';

// ─── LOGIN SCREEN ───────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth, setAdminAuth } = useAppStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login failed');
        return;
      }
      // Store csrfToken if present
      if (data.csrfToken) {
        localStorage.setItem('qms_csrf', data.csrfToken);
      }
      // Check if platform admin
      if (data.user.type === 'platform_admin' || data.user.role === 'PLATFORM_ADMIN') {
        setAdminAuth(
          { id: data.user.id, email: data.user.email, name: data.user.name },
          data.token
        );
        toast.success(`Welcome back, ${data.user.name}!`);
        return;
      }
      setAuth(data.user, data.token, data.csrfToken);
      toast.success(`Welcome back, ${data.user.name}!`);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white text-2xl font-bold mb-4">QF</div>
          <h1 className="text-3xl font-bold text-foreground">Staff Dashboard</h1>
          <p className="text-muted-foreground mt-2">Sign in to manage your queues</p>
        </div>
        <Card className="shadow-lg border-slate-200">
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="manager@quickbiterestaurant.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sign In
              </Button>
            </form>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => window.location.href = '/'}>
                ← Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">Agent: agent1@quickbiterestaurant.com / agent123</p>
          <p className="text-xs text-muted-foreground mt-1">Manager: manager@quickbiterestaurant.com / manager123</p>
          <p className="text-xs text-muted-foreground mt-1">Platform Admin: admin@yourqueueapp.com / admin123</p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── AGENT VIEW ─────────────────────────────────────────────
function AgentView({ user, tenantData, onRefresh }: { user: StaffUser; tenantData: { queues: Queue[] } | null; onRefresh: () => void }) {
  const [selectedQueueId, setSelectedQueueId] = useState<string>('');
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [servingTime, setServingTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [recentlyCalled, setRecentlyCalled] = useState<Ticket | null>(null);
  const [ticketListTab, setTicketListTab] = useState<'waiting' | 'served'>('waiting');
  const [ticketList, setTicketList] = useState<Ticket[]>([]);
  const [ticketListLoading, setTicketListLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const authToken = useAppStore((s) => s.authToken);

  const queues = tenantData?.queues?.filter(q => q.isActive) || [];
  const selectedQueue = queues.find(q => q.id === selectedQueueId);

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
  const fetchTicketList = useCallback(async (tab: 'waiting' | 'served') => {
    if (!selectedQueueId || !authToken) return;
    setTicketListLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
      const status = tab === 'waiting' ? 'WAITING' : 'COMPLETED';
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

  const { lastEvent, clearLastEvent } = useQueueWebSocket(user.tenantId, authToken);
  useEffect(() => {
    if (lastEvent?.event === 'TICKET_CALLED' || lastEvent?.event === 'TICKET_COMPLETED') {
      enhancedRefresh();
      clearLastEvent();
    }
  }, [lastEvent, enhancedRefresh, clearLastEvent]);

  const handleCallNext = async () => {
    if (!selectedQueueId) return;
    setLoading(true);
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
      setLoading(false);
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
      toast.info(`Ticket ${currentTicket._formattedSerial} moved to end of queue`);
      setCurrentTicket(null);
      setServingTime(0);
      enhancedRefresh();
    } catch {
      toast.error('Failed to skip ticket');
    } finally {
      setLoading(false);
      setSkipConfirm(false);
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

  const [walkInLoading, setWalkInLoading] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const handleWalkIn = async () => {
    if (!walkInName.trim() || !selectedQueueId) return;
    setWalkInLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/queues/join', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId: user.tenantId,
          queueId: selectedQueueId,
          customerName: walkInName.trim(),
          customerPhone: walkInPhone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Ticket ${data.ticket.formattedSerial} created for ${walkInName}`);
        setWalkInName('');
        setWalkInPhone('');
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Queue Selector – List View */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Select Queue</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowWalkIn(!showWalkIn)}>
              <UserPlus className="w-4 h-4 mr-1" /> Walk-in
            </Button>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          {queues.map((q) => {
            const isSelected = selectedQueueId === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => { setSelectedQueueId(q.id); setCurrentTicket(null); setServingTime(0); }}
                className={`flex-shrink-0 w-44 rounded-xl border-2 p-3 text-left transition-all ${
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

      {/* Walk-in Form */}
      <AnimatePresence>
        {showWalkIn && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Customer Name *</Label>
                    <Input placeholder="Enter customer name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} disabled={walkInLoading} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Phone (optional)</Label>
                    <Input placeholder="+880..." value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} disabled={walkInLoading} />
                  </div>
                  <Button onClick={handleWalkIn} className="bg-emerald-600 hover:bg-emerald-700" disabled={!walkInName.trim() || walkInLoading}>
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Next Button */}
      <motion.div className="flex justify-center" whileTap={{ scale: 0.95 }}>
        <Button
          onClick={handleCallNext}
          disabled={loading || !selectedQueueId}
          className="w-full sm:w-64 h-24 text-2xl font-bold bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-lg shadow-emerald-200 transition-all"
        >
          {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : (
            <>
              <Phone className="w-8 h-8 mr-3" />
              CALL NEXT
            </>
          )}
        </Button>
      </motion.div>

      {/* Currently Serving */}
      <AnimatePresence mode="wait">
        {recentlyCalled && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none">
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.5, repeat: 2 }} className="bg-emerald-600 text-white px-16 py-12 rounded-3xl text-center shadow-2xl">
              <p className="text-lg font-medium opacity-80">NOW SERVING</p>
              <p className="text-7xl font-bold mt-2">{recentlyCalled._formattedSerial}</p>
              <p className="text-xl mt-2">{recentlyCalled.customerName}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Currently Serving / Empty State */}
        <div className="lg:col-span-3">
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
                    <p className="text-5xl font-bold text-emerald-600">{currentTicket._formattedSerial}</p>
                    <p className="text-xl text-foreground mt-2">{currentTicket.customerName}</p>
                    {currentTicket.customerPhone && (
                      <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                        <Phone className="w-3 h-3" /> {currentTicket.customerPhone}
                      </p>
                    )}
                    <div className="flex items-center justify-center gap-2 mt-3 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span className="text-lg font-mono">{formatTime(servingTime)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <Button onClick={handleComplete} className="bg-emerald-600 hover:bg-emerald-700 h-14" disabled={loading}>
                      <CheckCircle2 className="w-5 h-5 mr-1" /> Complete
                    </Button>
                    <Button onClick={() => setSkipConfirm(true)} variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 h-14" disabled={loading}>
                      <SkipForward className="w-5 h-5 mr-1" /> Skip
                    </Button>
                    <Button onClick={() => setCancelConfirm(true)} variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 h-14" disabled={loading}>
                      <XCircle className="w-5 h-5 mr-1" /> Cancel
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
                      Are you sure you want to skip {currentTicket._formattedSerial}? The ticket will be moved to the end of the queue.
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
              <CardContent className="py-12 text-center">
                <div className="text-muted-foreground">
                  <ListOrdered className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg">No ticket currently being served</p>
                  <p className="text-sm mt-1">Click &quot;CALL NEXT&quot; to serve the next customer</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Queue Overview */}
        <div className="lg:col-span-2">
          {selectedQueue && (
            <Card aria-live="polite" className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Queue Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-6 text-center">
                  <div>
                    <p className="text-3xl font-bold text-emerald-600">{selectedQueue.nowServingSerial}</p>
                    <p className="text-xs text-muted-foreground mt-1">Now Serving</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-amber-600">{selectedQueue._waitingCount || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Waiting</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{selectedQueue._ewt ? Math.ceil(selectedQueue._ewt / 60) : 0}<span className="text-sm font-normal"> min</span></p>
                    <p className="text-xs text-muted-foreground mt-1">Est. Wait</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Ticket List – Waiting / Served */}
      {selectedQueueId && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tickets</CardTitle>
              <div className="flex bg-muted rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setTicketListTab('waiting')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    ticketListTab === 'waiting'
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Waiting ({ticketListTab === 'waiting' ? ticketList.length : '—'})
                </button>
                <button
                  type="button"
                  onClick={() => setTicketListTab('served')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    ticketListTab === 'served'
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Served ({ticketListTab === 'served' ? ticketList.length : '—'})
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {ticketListLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-muted/40 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : ticketList.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <ListOrdered className="w-8 h-8 mx-auto mb-2 opacity-30" />
                {ticketListTab === 'waiting' ? 'No tickets waiting' : 'No served tickets yet'}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {ticketList.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between py-2.5 px-3 rounded-lg border ${
                      ticketListTab === 'served'
                        ? 'border-green-100 bg-green-50/50'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                        ticketListTab === 'served'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {t._formattedSerial || `${selectedQueue?.prefix || ''}${String(t.serialNumber).padStart(3, '0')}`}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.customerName}</p>
                        {t.customerPhone && (
                          <p className="text-xs text-muted-foreground">{t.customerPhone}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
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
                      ) : (
                        <Badge variant="outline" className="mt-1 text-amber-600 border-amber-200 bg-amber-50 text-[10px]">
                          <Clock className="w-3 h-3 mr-0.5" /> Waiting
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── QUEUES TAB ─────────────────────────────────────────────
// ─── QUEUE CRUD DIALOGS ─────────────────────────────────────
function QueueFormDialog({
  open,
  onOpenChange,
  queue,
  tenantId,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: Queue | null;
  tenantId: string;
  onRefresh: () => void;
}) {
  const isEdit = !!queue;
  const [name, setName] = useState(queue?.name || '');
  const [description, setDescription] = useState(queue?.description || '');
  const [prefix, setPrefix] = useState(queue?.prefix || '');
  const [defaultServiceTimeSec, setDefaultServiceTimeSec] = useState(String(queue?.defaultServiceTimeSec || 300));
  const [loading, setLoading] = useState(false);
  const authToken = useAppStore((s) => s.authToken);

  useEffect(() => {
    if (open) {
      setName(queue?.name || '');
      setDescription(queue?.description || '');
      setPrefix(queue?.prefix || '');
      setDefaultServiceTimeSec(String(queue?.defaultServiceTimeSec || 300));
    }
  }, [open, queue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prefix.trim()) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      if (isEdit) {
        const res = await fetch('/api/queues', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            queueId: queue!.id,
            name: name.trim(),
            description: description.trim() || undefined,
            prefix: prefix.trim().toUpperCase(),
            defaultServiceTimeSec: parseInt(defaultServiceTimeSec) || 300,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to update queue'); return; }
        toast.success(`Queue "${name}" updated`);
      } else {
        const res = await fetch('/api/queues', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            tenantId,
            name: name.trim(),
            description: description.trim() || undefined,
            prefix: prefix.trim().toUpperCase(),
            defaultServiceTimeSec: parseInt(defaultServiceTimeSec) || 300,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || 'Failed to create queue'); return; }
        toast.success(`Queue "${name}" created`);
      }
      onOpenChange(false);
      onRefresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Queue' : 'Create Queue'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="queue-name">Name *</Label>
            <Input id="queue-name" placeholder="e.g. General, VIP" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-desc">Description</Label>
            <Input id="queue-desc" placeholder="Optional description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-prefix">Prefix * <span className="text-xs text-muted-foreground">(1-2 chars)</span></Label>
            <Input id="queue-prefix" placeholder="e.g. A, VIP" maxLength={2} value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="queue-time">Default Service Time (seconds)</Label>
            <Input id="queue-time" type="number" min={10} value={defaultServiceTimeSec} onChange={(e) => setDefaultServiceTimeSec(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading || !name.trim() || !prefix.trim()}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Queue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteQueueDialog({
  open,
  onOpenChange,
  queue,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: Queue | null;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const authToken = useAppStore((s) => s.authToken);

  const handleDelete = async () => {
    if (!queue) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/queues', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ queueId: queue.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete queue'); return; }
      toast.success(`Queue "${queue.name}" deactivated`);
      onOpenChange(false);
      onRefresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate Queue</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to deactivate <strong>{queue?.name}</strong>? This action can be undone by re-activating the queue later.
        </p>
        <p className="text-xs text-amber-600">
          Queues with active waiting tickets cannot be deactivated.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── QUEUES TAB (with CRUD) ─────────────────────────────────
function QueuesTab({ user, tenantData, onRefresh }: { user: StaffUser; tenantData: { queues: Queue[] } | null; onRefresh: () => void }) {
  const queues = tenantData?.queues || [];
  const isManager = user.role === 'MANAGER';
  const authToken = useAppStore((s) => s.authToken);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  // Edit dialog
  const [editQueue, setEditQueue] = useState<Queue | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Delete dialog
  const [deleteQueue, setDeleteQueue] = useState<Queue | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleOpenEdit = (queue: Queue) => {
    setEditQueue(queue);
    setEditOpen(true);
  };

  const handleOpenDelete = (queue: Queue) => {
    setDeleteQueue(queue);
    setDeleteOpen(true);
  };

  const handleToggleActive = async (queue: Queue) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/queues', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ queueId: queue.id, isActive: !queue.isActive }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to toggle queue'); return; }
      toast.success(`Queue "${queue.name}" ${queue.isActive ? 'deactivated' : 'activated'}`);
      onRefresh();
    } catch {
      toast.error('Network error. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Service Queues</h2>
          <Badge variant="secondary">{queues.filter(q => q.isActive).length} active</Badge>
        </div>
        {isManager && (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Create Queue
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {queues.map((queue) => (
          <motion.div key={queue.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: queues.indexOf(queue) * 0.05 }}>
            <Card className={queue.isActive ? '' : 'opacity-50'}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                      {queue.prefix}
                    </div>
                    <div>
                      <p className="font-medium">{queue.name}</p>
                      <p className="text-xs text-muted-foreground">Avg: {queue._avgServiceTime || queue.defaultServiceTimeSec}s per customer</p>
                    </div>
                  </div>
                  <Badge variant={queue.isActive ? 'default' : 'secondary'} className={queue.isActive ? 'bg-emerald-100 text-emerald-700' : ''}>
                    {queue.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center pt-3 border-t">
                  <div>
                    <p className="text-lg font-bold">{queue.nowServingSerial ? `${queue.prefix}-${String(queue.nowServingSerial).padStart(3, '0')}` : '—'}</p>
                    <p className="text-xs text-muted-foreground">Serving</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-600">{queue._waitingCount || 0}</p>
                    <p className="text-xs text-muted-foreground">Waiting</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{queue._ewt ? `${Math.ceil(queue._ewt / 60)}m` : '—'}</p>
                    <p className="text-xs text-muted-foreground">EWT</p>
                  </div>
                </div>
                {isManager && (
                  <div className="flex items-center gap-1 pt-3 border-t mt-3">
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleOpenEdit(queue)} aria-label={`Edit ${queue.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleToggleActive(queue)} aria-label={`${queue.isActive ? 'Deactivate' : 'Activate'} ${queue.name}`}>
                      {queue.isActive ? <ShieldX className="w-3.5 h-3.5 text-amber-600" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleOpenDelete(queue)} aria-label={`Delete ${queue.name}`}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      {queues.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No queues configured. Contact your manager to set up service lines.
          </CardContent>
        </Card>
      )}

      {/* CRUD Dialogs */}
      <QueueFormDialog open={createOpen} onOpenChange={setCreateOpen} queue={null} tenantId={user.tenantId} onRefresh={onRefresh} />
      <QueueFormDialog open={editOpen} onOpenChange={setEditOpen} queue={editQueue} tenantId={user.tenantId} onRefresh={onRefresh} />
      <DeleteQueueDialog open={deleteOpen} onOpenChange={setDeleteOpen} queue={deleteQueue} onRefresh={onRefresh} />
    </div>
  );
}

// ─── ANALYTICS TAB ──────────────────────────────────────────
function AnalyticsTab({ tenantId }: { tenantId: string }) {
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

// ─── WALLET TAB ─────────────────────────────────────────────
function WalletTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const [walletData, setWalletData] = useState<{
    tenant: { id: string; name: string; planTier: string; walletBalance: number };
    usage: { todayTickets: number; totalCharged: number };
    transactions: Array<{ id: string; type: string; amountCents: number; description: string | null; createdBy: string | null; createdAt: string }>;
  } | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchWallet = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/tenants/wallet?tenantId=${tenantId}`, { headers });
      const data = await res.json();
      setWalletData(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [tenantId, authToken]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  const handleTopUp = async () => {
    const tk = parseInt(topUpAmount);
    if (isNaN(tk) || tk <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tenants/wallet', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tenantId, amountCents: tk * 100 }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Added ${tk} TK to wallet`);
        setTopUpAmount('');
        fetchWallet();
      } else {
        toast.error(data.error);
      }
    } catch { toast.error('Top-up failed'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!walletData) return null;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Wallet & Billing</h2>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white border-0">
        <CardContent className="pt-6 pb-6">
          <p className="text-emerald-100 text-sm">Current Balance</p>
          <p className="text-4xl font-bold mt-1">৳{(walletData.tenant.walletBalance / 100).toLocaleString()}</p>
          <div className="flex gap-4 mt-4 text-sm text-emerald-100">
            <span>Tier: <strong className="text-white">{walletData.tenant.planTier}</strong></span>
            <span>Cost: <strong className="text-white">৳1/ticket</strong></span>
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Today&apos;s Usage</p>
            <p className="text-2xl font-bold">{walletData.usage.todayTickets} tickets</p>
            <p className="text-sm text-muted-foreground">৳{(walletData.usage.todayTickets * 100 / 100).toFixed(2)} spent today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total Charged</p>
            <p className="text-2xl font-bold">৳{(walletData.usage.totalCharged / 100).toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">all time</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {walletData.transactions.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>}
              {walletData.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{tx.description || tx.type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge variant={tx.amountCents > 0 ? 'default' : 'secondary'} className={tx.amountCents > 0 ? 'bg-emerald-100 text-emerald-700' : ''}>
                    {tx.amountCents > 0 ? '+' : ''}৳{(tx.amountCents / 100).toFixed(2)}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Top Up */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top Up Wallet</CardTitle>
          <CardDescription>Quick manual top-up or use Payment Gateway in Settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="sr-only">Amount (TK)</Label>
              <Input type="number" placeholder="Amount in TK" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} min="1" />
            </div>
            <Button onClick={handleTopUp} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1" /> Quick Top Up
            </Button>
          </div>
          <div className="flex gap-2 mt-3">
            {[100, 500, 1000, 5000].map((amt) => (
              <Button key={amt} variant="outline" size="sm" onClick={() => setTopUpAmount(String(amt))}>
                ৳{amt}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── BRANDING TAB ───────────────────────────────────────────
function BrandingTab({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [branding, setBranding] = useState({ primaryColor: '#059669', secondaryColor: '#34d399', logoText: 'QF', welcomeMessage: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tenants/branding?tenantId=${tenantId}`);
        const data = await res.json();
        if (data.branding) {
          setBranding((prev) => ({ ...prev, ...data.branding }));
        }
        if (data.welcomeMessage) {
          setBranding((prev) => ({ ...prev, welcomeMessage: data.welcomeMessage }));
        }
      } catch { /* use defaults */ }
      finally { setLoading(false); }
    })();
  }, [tenantId]);

  const authToken = useAppStore((s) => s.authToken);

  const handleSave = async () => {
    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tenants/branding', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tenantId, brandingConfig: branding }),
      });
      if (res.ok) {
        toast.success('Branding updated successfully');
      } else {
        toast.error('Failed to save branding');
      }
    } catch { toast.error('Failed to save branding'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Branding & Appearance</h2>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customize</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Primary Color</Label>
              <div className="flex gap-2">
                <Input type="color" value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })} className="w-12 h-10 p-1 cursor-pointer" />
                <Input value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })} className="flex-1 font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Secondary Color</Label>
              <div className="flex gap-2">
                <Input type="color" value={branding.secondaryColor} onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })} className="w-12 h-10 p-1 cursor-pointer" />
                <Input value={branding.secondaryColor} onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })} className="flex-1 font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Logo Text (2 letters)</Label>
              <Input maxLength={2} value={branding.logoText} onChange={(e) => setBranding({ ...branding, logoText: e.target.value.toUpperCase() })} className="w-24 text-center text-2xl font-bold" />
            </div>
            <div className="space-y-2">
              <Label>Welcome Message</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={branding.welcomeMessage}
                onChange={(e) => setBranding({ ...branding, welcomeMessage: e.target.value })}
                placeholder="Welcome to our service! Please join the queue."
              />
            </div>
            <Button onClick={handleSave} className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Palette className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ticket Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-xl overflow-hidden">
              <div className="p-4 text-white text-center" style={{ backgroundColor: branding.primaryColor }}>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/20 text-2xl font-bold mb-2">
                  {branding.logoText}
                </div>
                <p className="font-semibold">{tenantName}</p>
              </div>
              <div className="p-6 text-center">
                <p className="text-3xl font-bold" style={{ color: branding.primaryColor }}>A-006</p>
                <p className="text-muted-foreground mt-1">General Queue</p>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Position</span>
                    <span className="font-medium">5th in line</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Est. Wait</span>
                    <span className="font-medium">~15 min</span>
                  </div>
                </div>
                <div className="mt-4">
                  <Progress value={60} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{branding.welcomeMessage || 'Welcome!'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue QR Codes */}
      <QueueQRCodes tenantId={tenantId} tenantName={tenantName} />
    </div>
  );
}

// ─── QUEUE QR CODES SECTION ─────────────────────────────────
function QueueQRCodes({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [queues, setQueues] = useState<Queue[]>([]);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const tenantUrl = `${origin}/?tenant=${tenantId}`;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tenants/${tenantId}/queues`);
        const data = await res.json();
        if (Array.isArray(data.queues)) setQueues(data.queues);
      } catch { /* silent */ }
    })();
  }, [tenantId]);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  const handleDownload = (queueName: string, svgEl: HTMLElement | null) => {
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qrcode-${tenantName.toLowerCase().replace(/\s+/g, '-')}-${queueName.toLowerCase().replace(/\s+/g, '-')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Queue QR Codes</CardTitle>
            <CardDescription className="text-xs mt-1">Print these QR codes so customers can scan to join your queue instantly</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* General tenant QR code */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-lg border bg-slate-50/50 mb-6">
          <div className="shrink-0 bg-white p-3 rounded-xl shadow-sm border">
            <div ref={(el) => {}}>
              <QRCodeDisplay value={tenantUrl} size={140} />
            </div>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-semibold">General Queue Join Link</p>
            <p className="text-xs text-muted-foreground mt-1 break-all">{tenantUrl}</p>
            <p className="text-xs text-muted-foreground mt-2">Customers scan this to see all your queues and pick one.</p>
            <div className="flex gap-2 mt-3 justify-center sm:justify-start">
              <Button variant="outline" size="sm" onClick={() => handleCopy(tenantUrl)}>
                <Copy className="w-3.5 h-3.5 mr-1" /> Copy Link
              </Button>
              <Button variant="outline" size="sm" onClick={(e) => {
                const svg = (e.currentTarget.closest('.flex.flex-col') as HTMLElement)?.querySelector('svg');
                handleDownload('general', svg || null);
              }}>
                <Download className="w-3.5 h-3.5 mr-1" /> Download SVG
              </Button>
            </div>
          </div>
        </div>

        {/* Per-queue QR codes */}
        {queues.length > 0 && (
          <>
            <p className="text-sm font-medium mb-3">Per-Queue QR Codes</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {queues.map((q) => {
                const queueUrl = `${origin}/?tenant=${tenantId}`;
                return (
                  <div key={q.id} className="flex flex-col items-center gap-2 p-3 rounded-lg border bg-white">
                    <div className="bg-white p-2 rounded-lg shadow-sm border">
                      <QRCodeDisplay value={queueUrl} size={100} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">{q.prefix}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">{q.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleCopy(queueUrl)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => {
                        const svg = (e.currentTarget.closest('.flex.flex-col') as HTMLElement)?.querySelector('svg');
                        handleDownload(q.prefix, svg || null);
                      }}>
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── STAFF TAB ───────────────────────────────────────────
function StaffTab({ tenantId }: { tenantId: string }) {
  const authToken = useAppStore((s) => s.authToken);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'AGENT' | 'MANAGER'>('AGENT');
  const [deleteConfirmMember, setDeleteConfirmMember] = useState<StaffUser | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const fetchStaff = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/staff?tenantId=${tenantId}`, { headers });
      const data = await res.json();
      setStaff(Array.isArray(data.staff) ? data.staff : []);
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [tenantId, authToken]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('AGENT');
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ tenantId, email: formEmail.trim(), name: formName.trim(), password: formPassword, role: formRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Staff member ${formName} created`);
        setDialogOpen(false);
        resetForm();
        fetchStaff();
      } else {
        toast.error(data.error || 'Failed to create staff');
      }
    } catch {
      toast.error('Failed to create staff');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (member: StaffUser) => {
    try {
      const res = await fetch('/api/staff', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ userId: member.id, isActive: !member.isActive }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${member.name} is now ${!member.isActive ? 'active' : 'inactive'}`);
        fetchStaff();
      } else {
        toast.error(data.error || 'Failed to update staff');
      }
    } catch {
      toast.error('Failed to update staff');
    }
  };

  const handleChangeRole = async (member: StaffUser) => {
    const newRole = member.role === 'MANAGER' ? 'AGENT' : 'MANAGER';
    try {
      const res = await fetch('/api/staff', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ userId: member.id, role: newRole }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${member.name} is now ${newRole}`);
        fetchStaff();
      } else {
        toast.error(data.error || 'Failed to change role');
      }
    } catch {
      toast.error('Failed to change role');
    }
  };

  const handleDelete = async (member: StaffUser) => {
    // E5: Use AlertDialog confirmation instead of confirm()
    setDeleteConfirmMember(member);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmMember) return;
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`/api/staff?userId=${deleteConfirmMember.id}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${deleteConfirmMember.name} has been removed`);
        fetchStaff();
      } else {
        toast.error(data.error || 'Failed to delete staff');
      }
    } catch {
      toast.error('Failed to delete staff');
    } finally {
      setDeleteConfirmMember(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Staff Management</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <UserPlus className="w-4 h-4 mr-1" /> Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input placeholder="Full name" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="staff@example.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" placeholder="Min 8 chars, 1 uppercase, 1 digit" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground">Min 8 characters, 1 uppercase letter, 1 digit</p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as 'AGENT' | 'MANAGER')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AGENT">Agent</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Create Staff
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No staff members found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow key={member.id} className={!member.isActive ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant={member.role === 'MANAGER' ? 'default' : 'secondary'} className={member.role === 'MANAGER' ? 'bg-emerald-100 text-emerald-700' : ''}>
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={member.isActive ? 'text-emerald-600 border-emerald-300 bg-emerald-50' : 'text-red-600 border-red-300 bg-red-50'}>
                          {member.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(member)}
                            title={member.isActive ? 'Deactivate' : 'Activate'}
                            aria-label={`${member.isActive ? 'Deactivate' : 'Activate'} ${member.name}`}
                          >
                            {member.isActive ? <ShieldX className="w-4 h-4 text-amber-600" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleChangeRole(member)}
                            title={`Change role to ${member.role === 'MANAGER' ? 'Agent' : 'Manager'}`}
                            aria-label={`Change role for ${member.name}`}
                          >
                            <UserCog className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(member)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete staff member"
                            aria-label={`Delete ${member.name}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* E5: Delete Confirmation AlertDialog */}
      <AlertDialog open={!!deleteConfirmMember} onOpenChange={(open) => { if (!open) setDeleteConfirmMember(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteConfirmMember?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
// ─── CHANGE PASSWORD DIALOG ─────────────────────────────────
function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const authToken = useAppStore((s) => s.authToken);

  const resetForm = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to change password'); return; }
      toast.success('Password changed successfully');
      onOpenChange(false);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cp-current">Current Password *</Label>
            <Input id="cp-current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-new">New Password * <span className="text-xs text-muted-foreground">(min 8 chars)</span></Label>
            <Input id="cp-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirm">Confirm New Password *</Label>
            <Input id="cp-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DashboardSidebar({ navItems, dashboardTab, setDashboardTab, authUser, logout }: {
  navItems: Array<{ id: string; label: string; icon: typeof Phone }>;
  dashboardTab: string;
  setDashboardTab: (id: string) => void;
  authUser: StaffUser;
  logout: () => void;
}) {
  const [changePwdOpen, setChangePwdOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">QF</div>
          <div>
            <p className="font-semibold text-sm">QueueFlow</p>
            <p className="text-xs text-muted-foreground">Dashboard</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Dashboard navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setDashboardTab(item.id)}
            aria-current={dashboardTab === item.id ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors ${
              dashboardTab === item.id
                ? 'bg-emerald-50 text-emerald-700 font-medium'
                : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t shrink-0 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{authUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{authUser.name}</p>
            <p className="text-xs text-muted-foreground truncate">{authUser.role}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => setChangePwdOpen(true)}>
          <KeyRound className="w-4 h-4 mr-2" /> Change Password
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>
      <ChangePasswordDialog open={changePwdOpen} onOpenChange={setChangePwdOpen} />
    </div>
  );
}

// ─── MAIN DASHBOARD ─────────────────────────────────────────
export default function DashboardView() {
  const { authUser, authToken, logout, dashboardTab, setDashboardTab } = useAppStore();
  const [tenantData, setTenantData] = useState<{ queues: Queue[] } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tenantIdRef = useRef(authUser?.tenantId);
  const isManager = authUser?.role === 'MANAGER';

  const fetchTenantData = useCallback(async () => {
    const tid = tenantIdRef.current;
    if (!tid) return;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = useAppStore.getState().authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tenantId: tid }),
      });
      const data = await res.json();
      if (data.tenant) {
        setTenantData(data.tenant);
      }
    } catch { /* silent */ }
  }, []);

  // Check auth on mount
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('qms_token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('qms_user') : null;
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        useAppStore.getState().setAuth(user, token);
      } catch { /* invalid stored data */ }
    }
  }, []);

  useEffect(() => {
    tenantIdRef.current = authUser?.tenantId;
    if (authUser?.tenantId) {
      fetchTenantData();
    }
  }, [authUser?.tenantId, fetchTenantData]);

  // G1: Mobile menu state (must be before early return for hooks ordering)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // G1: Close mobile sidebar/menu on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sidebarOpen) setSidebarOpen(false);
        if (mobileMenuOpen) setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [sidebarOpen, mobileMenuOpen]);

  // Show login if not authenticated
  if (!authUser) {
    return <LoginScreen />;
  }

  const navItems = [
    { id: 'agent' as const, label: 'Agent View', icon: Phone },
    { id: 'queues' as const, label: 'Queues', icon: ListOrdered },
    ...(isManager ? [
      { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
      { id: 'wallet' as const, label: 'Wallet', icon: Wallet },
      { id: 'service-windows' as const, label: 'Hours', icon: CalendarClock },
      { id: 'appointments' as const, label: 'Appts', icon: CalendarClock },
      { id: 'feedback' as const, label: 'Feedback', icon: Star },
      { id: 'webhooks' as const, label: 'Webhooks', icon: Webhook },
      { id: 'branding' as const, label: 'Branding', icon: Palette },
      { id: 'staff' as const, label: 'Staff', icon: Users },
      { id: 'settings' as const, label: 'Settings', icon: Settings },
    ] : [])
  ];

  // E1: Mobile nav — show max 5 items, overflow goes into "More" sheet
  const mobileNavItems = navItems.slice(0, 4);
  const moreNavItems = navItems.slice(4);
  const showMoreButton = moreNavItems.length > 0;

  return (
    <div className="h-screen flex flex-row overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-white shrink-0 h-full">
        <DashboardSidebar navItems={navItems} dashboardTab={dashboardTab} setDashboardTab={(id) => { setDashboardTab(id); setSidebarOpen(false); }} authUser={authUser} logout={logout} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 shadow-xl md:hidden">
              <DashboardSidebar navItems={navItems} dashboardTab={dashboardTab} setDashboardTab={(id) => { setDashboardTab(id); setSidebarOpen(false); }} authUser={authUser} logout={logout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b bg-white flex items-center px-4 gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{authUser.tenant?.name || 'Dashboard'}</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">{authUser.email}</p>
          </div>
          <Badge variant={isManager ? 'default' : 'secondary'} className={isManager ? 'bg-emerald-100 text-emerald-700' : ''}>
            {authUser.role}
          </Badge>
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{authUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
        </header>

        {/* Page Content */}
        <main id="main-content" className="flex-1 p-4 sm:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div key={dashboardTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
              {dashboardTab === 'agent' && (
                <AgentView user={authUser} tenantData={tenantData} onRefresh={fetchTenantData} />
              )}
              {dashboardTab === 'queues' && (
                <QueuesTab user={authUser} tenantData={tenantData} onRefresh={fetchTenantData} />
              )}
              {dashboardTab === 'analytics' && isManager && (
                <AnalyticsTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'wallet' && isManager && (
                <WalletTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'branding' && isManager && (
                <BrandingTab tenantId={authUser.tenantId} tenantName={authUser.tenant?.name || ''} />
              )}
              {dashboardTab === 'staff' && isManager && (
                <StaffTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'service-windows' && isManager && (
                <ServiceWindowsTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'appointments' && isManager && (
                <AppointmentsTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'feedback' && isManager && (
                <FeedbackTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'webhooks' && isManager && (
                <WebhooksTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'settings' && isManager && (
                <SettingsTab tenantId={authUser.tenantId} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* E1: Mobile Bottom Nav — max 5 items with "More" sheet */}
        <nav className="md:hidden border-t bg-white flex shrink-0 safe-area-bottom" aria-label="Mobile navigation">
          {mobileNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setDashboardTab(item.id)}
              className={`flex-1 flex flex-col items-center py-3 min-h-[44px] text-xs transition-colors ${
                dashboardTab === item.id ? 'text-emerald-600' : 'text-muted-foreground'
              }`}
              aria-current={dashboardTab === item.id ? 'page' : undefined}
            >
              <item.icon className="w-5 h-5" />
              <span className="mt-0.5">{item.label.split(' ')[0]}</span>
            </button>
          ))}
          {showMoreButton && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={`flex-1 flex flex-col items-center py-3 min-h-[44px] text-xs transition-colors text-muted-foreground`}
              aria-label="More menu options"
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="mt-0.5">More</span>
            </button>
          )}
        </nav>

        {/* E1: More menu sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="bottom" className="max-h-[60vh]">
            <SheetHeader>
              <SheetTitle>More Options</SheetTitle>
            </SheetHeader>
            <nav className="grid grid-cols-3 gap-2 py-4" aria-label="Additional navigation">
              {moreNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setDashboardTab(item.id); setMobileMenuOpen(false); }}
                  className={`flex flex-col items-center gap-2 p-3 min-h-[44px] rounded-xl transition-colors ${
                    dashboardTab === item.id ? 'bg-emerald-50 text-emerald-700' : 'text-muted-foreground hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}