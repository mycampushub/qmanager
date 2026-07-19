'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { Tenant, Queue, Ticket } from '@/lib/types';
import { QrCode, ArrowLeft, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n';
import { useQueueEvents } from '@/hooks/use-queue-events';

// ─── EXTRACTED COMPONENTS ──────────────────────────────────
import QueueSelector from '@/components/join/QueueSelector';
import { TicketStatusView, MyTicketsView } from '@/components/join/TicketStatus';
import { pageVariants, pageTransition } from '@/components/join/join-helpers';

// ---------------------------------------------------------------------------
// Push notification helper
// ---------------------------------------------------------------------------
async function registerPushNotification(tenantId: string, ticketId: string) {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    // Since we don't have VAPID keys, use a placeholder subscription
    const endpoint = 'placeholder';
    const keys = { p256dh: '', auth: '' };
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, ticketId, endpoint, keys }),
    }).catch(() => {
      // Silently fail if the endpoint doesn't exist yet
    });
  } catch {
    // Silently fail if push isn't supported
  }
}

// ---------------------------------------------------------------------------
// No Tenant Landing – shown when no ?tenant=xxx param is provided
// ---------------------------------------------------------------------------

function NoTenantLanding() {
  const { setCurrentView } = useAppStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-24 px-4 text-center"
    >
      <div className="flex size-20 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-6">
        <QrCode className="size-10" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">Join a Queue</h2>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
        Please scan the QR code at the business location or use the direct link shared by the business to join a queue.
      </p>
      <Button
        className="h-12 px-8 text-base font-semibold"
        onClick={() => setCurrentView('marketing')}
      >
        Go to Homepage
      </Button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main JoinView
// ---------------------------------------------------------------------------

type Step = 'queue' | 'confirmation' | 'myTickets';

export default function JoinView() {
  const {
    joinTenantId,
    setJoinTenantId,
    joinQueueId,
    setJoinQueueId,
    activeTicket,
    setActiveTicket,
    myTickets,
    setMyTickets,
    setCurrentView,
  } = useAppStore();

  // i18n
  const { locale, setLocale } = useLocale();

  // Step management
  const [step, setStep] = useState<Step>('queue');
  const [direction, setDirection] = useState(1);

  // Data
  const [tenantWithQueues, setTenantWithQueues] = useState<Tenant | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);

  // Loading states
  const [loadingTenantDetail, setLoadingTenantDetail] = useState(false);
  const [joining, setJoining] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [loadingMyTickets, setLoadingMyTickets] = useState(false);

  const [ticket, setTicket] = useState<Ticket | null>(activeTicket);

  // Real-time events for ticket status changes (SSE or adaptive polling)
  const { lastEvent, clearLastEvent } = useQueueEvents(ticket?.tenantId);

  // --- Callbacks (declared before effects that use them) ---

  // Navigate steps
  const goTo = useCallback(
    (next: Step, dir?: number) => {
      setDirection(dir ?? (['queue', 'confirmation', 'myTickets'].indexOf(next) > ['queue', 'confirmation', 'myTickets'].indexOf(step) ? 1 : -1));
      setStep(next);
    },
    [step]
  );

  const handleSelectTenant = useCallback(
    async (tenantId: string) => {
      setLoadingTenantDetail(true);
      setJoinTenantId(tenantId);
      try {
        const res = await fetch(`/api/tenants/${tenantId}/display`);
        if (!res.ok) throw new Error('Failed to load tenant');
        const data = await res.json();
        const t = data.tenant;
        setTenantWithQueues(t);
        setQueues(t._queues ?? []);
        goTo('queue', 1);
      } catch {
        toast.error('Failed to load location details');
        setJoinTenantId(null);
      } finally {
        setLoadingTenantDetail(false);
      }
    },
    [setJoinTenantId, goTo]
  );

  const handleJoin = useCallback(
    async (queueId: string, name: string, phone: string | undefined, notes: string | undefined) => {
      if (!joinTenantId) return;
      setJoining(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        // Send client timezone so server can check service windows in local time
        try { headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }
        const res = await fetch('/api/queues/join', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            tenantId: joinTenantId,
            queueId,
            customerName: name,
            customerPhone: phone,
            notes,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'DUPLICATE_TICKET') {
            toast.error(data.error);
            // Load the existing ticket
            if (data.existingTicketId) {
              const tenantQuery = data.existingTenantId ? `&tenantId=${encodeURIComponent(data.existingTenantId)}` : '';
              const statusRes = await fetch(`/api/tickets/status?ticketId=${data.existingTicketId}${tenantQuery}`);
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                const existingTicket = statusData.ticket;
                if (existingTicket) {
                  setTicket(existingTicket);
                  setActiveTicket(existingTicket);
                  goTo('confirmation', 1);
                }
              }
            }
            return;
          }
          throw new Error(data.error || 'Failed to join queue');
        }
        const newTicket = data.ticket as Ticket;
        setTicket(newTicket);
        setActiveTicket(newTicket);
        toast.success(`Ticket ${newTicket._formattedSerial} created!`);
        // B3: Register for push notifications
        registerPushNotification(newTicket.tenantId, newTicket.id);
        goTo('confirmation', 1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to get ticket');
      } finally {
        setJoining(false);
      }
    },
    [joinTenantId, setActiveTicket, goTo]
  );

  const handleTrack = useCallback(async () => {
    if (!ticket) return;
    setTracking(true);
    try {
      const params = new URLSearchParams({ ticketId: ticket.id });
      if (ticket.tenantId) params.set('tenantId', ticket.tenantId);
      const res = await fetch(`/api/tickets/status?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const updated = data.ticket;
      if (updated) {
        setTicket(updated);
        setActiveTicket(updated);
      }
    } catch {
      toast.error('Failed to update ticket status');
    } finally {
      setTracking(false);
    }
  }, [ticket, setActiveTicket]);

  const handleShowMyTickets = useCallback(async () => {
    if (!ticket?.customerPhone || !ticket?.tenantId) return;
    setLoadingMyTickets(true);
    goTo('myTickets', 1);
    try {
      const res = await fetch(
        `/api/tickets/status?phone=${encodeURIComponent(ticket.customerPhone)}&tenantId=${ticket.tenantId}`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setMyTickets(data.tickets ?? []);
    } catch {
      toast.error('Failed to load your tickets');
    } finally {
      setLoadingMyTickets(false);
    }
  }, [ticket, setMyTickets, goTo]);

  const handleSelectTicketFromWallet = useCallback(
    (t: Ticket) => {
      setTicket(t);
      setActiveTicket(t);
      goTo('confirmation', 1);
    },
    [setActiveTicket, goTo]
  );

  const handleHome = useCallback(() => {
    setJoinTenantId(null);
    setJoinQueueId(null);
    setTenantWithQueues(null);
    setQueues([]);
    setTicket(null);
    setActiveTicket(null);
    setCurrentView('marketing');
  }, [setJoinTenantId, setJoinQueueId, setActiveTicket, setCurrentView]);

  const handleNewTicket = useCallback(() => {
    setTicket(null);
    setActiveTicket(null);
    setJoinQueueId(null);
    goTo('queue', -1);
  }, [setActiveTicket, setJoinQueueId, goTo]);

  const handleLeaveQueue = useCallback(async () => {
    if (!ticket) return;
    try {
      const res = await fetch('/api/tickets/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.id, tenantId: ticket.tenantId }),
      });
      if (!res.ok) throw new Error('Failed to leave queue');
      toast.success('You have left the queue');
      setTicket(null);
      setActiveTicket(null);
      goTo('queue', -1);
    } catch {
      toast.error('Failed to leave the queue');
    }
  }, [ticket, setActiveTicket, goTo]);

  // --- Effects ---

  // Auto-load tenant data when joinTenantId is set
  useEffect(() => {
    if (!joinTenantId) return;
    handleSelectTenant(joinTenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinTenantId]);

  // If activeTicket is set externally, go to confirmation
  useEffect(() => {
    if (activeTicket) {
      setTicket(activeTicket);
      setStep('confirmation');
    }
  }, [activeTicket]);

  // React to real-time events for ticket status changes
  useEffect(() => {
    if (!lastEvent || !ticket) return;

    const { type, payload } = lastEvent;

    if (type === 'TICKET_CALLED' && payload?.ticketId === ticket.id) {
      setTicket(prev => prev ? { ...prev, status: 'SERVING' as const, servedAt: new Date().toISOString() } : prev);
      setActiveTicket({ ...ticket, status: 'SERVING' as const, servedAt: new Date().toISOString() });
      toast.success('Your turn has come! Please proceed to the counter.');
    } else if (type === 'TICKET_COMPLETED' && payload?.ticketId === ticket.id) {
      setTicket(prev => prev ? { ...prev, status: 'COMPLETED' as const, completedAt: new Date().toISOString() } : prev);
      setActiveTicket({ ...ticket, status: 'COMPLETED' as const, completedAt: new Date().toISOString() });
      toast.success('Your service has been completed!');
    } else if (type === 'TICKET_SKIPPED' && payload?.ticketId === ticket.id) {
      setTicket(prev => prev ? { ...prev, status: 'SKIPPED' as const, skippedAt: new Date().toISOString() } : prev);
      setActiveTicket({ ...ticket, status: 'SKIPPED' as const, skippedAt: new Date().toISOString() });
      toast.error('Your ticket was skipped. Please contact staff.');
    } else if (type === 'TICKET_CANCELLED' && payload?.ticketId === ticket.id) {
      setTicket(prev => prev ? { ...prev, status: 'CANCELLED' as const, cancelledAt: new Date().toISOString() } : prev);
      setActiveTicket({ ...ticket, status: 'CANCELLED' as const, cancelledAt: new Date().toISOString() });
      toast.error('Your ticket has been cancelled.');
    } else if (type === 'TICKET_RECALLED' && payload?.ticketId === ticket.id) {
      setTicket(prev => prev ? { ...prev, status: 'SERVING' as const, servedAt: new Date().toISOString() } : prev);
      setActiveTicket({ ...ticket, status: 'SERVING' as const, servedAt: new Date().toISOString() });
      toast.success('Your ticket has been recalled! Please proceed.');
    }

    clearLastEvent();
  }, [lastEvent, ticket, setActiveTicket, clearLastEvent]);

  // Determine the header subtitle
  const headerSubtitle = (() => {
    if (step === 'queue' || step === 'confirmation' || step === 'myTickets') {
      return tenantWithQueues?.name || '';
    }
    return '';
  })();

  // If no tenant ID, show the landing page
  if (!joinTenantId) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-border/50">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
            <button
              onClick={() => setCurrentView('marketing')}
              className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-800 transition-colors min-h-[44px] min-w-[44px] justify-center"
              aria-label="Go to home"
            >
              <QrCode className="size-5" />
              <span className="hidden sm:inline">QueueFlow</span>
            </button>
            <div className="w-[44px]" />
          </div>
        </header>
        <main className="flex-1 max-w-lg mx-auto w-full px-4">
          <NoTenantLanding />
        </main>
        <footer className="py-4 text-center border-t border-border/40 mt-auto">
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-emerald-600">QueueFlow</span>
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={handleHome}
            className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-800 transition-colors min-h-[44px] min-w-[44px] justify-center"
            aria-label="Go to home"
          >
            <QrCode className="size-5" />
            <span className="hidden sm:inline">QueueFlow</span>
          </button>

          {headerSubtitle && (
            <span className="text-sm font-medium text-muted-foreground truncate max-w-[200px]">
              {headerSubtitle}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Switch language"
          >
            <Globe className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="min-h-[44px] min-w-[44px] px-2"
            onClick={() => {
              if (step === 'queue') handleHome();
              else if (step === 'confirmation') handleNewTicket();
              else if (step === 'myTickets') goTo('confirmation', -1);
              else handleHome();
            }}
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <AnimatePresence mode="wait" custom={direction}>
          {step === 'queue' && tenantWithQueues && (
            <motion.div
              key="queue"
              custom={direction}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={pageTransition}
            >
              <QueueSelector
                tenant={tenantWithQueues}
                queues={joinQueueId ? queues.filter(q => q.id === joinQueueId) : queues}
                loading={loadingTenantDetail}
                joining={joining}
                initialQueueId={joinQueueId}
                onJoin={handleJoin}
                onBack={handleHome}
              />
            </motion.div>
          )}

          {step === 'confirmation' && ticket && (
            <motion.div
              key="confirmation"
              custom={direction}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={pageTransition}
            >
              <TicketStatusView
                ticket={ticket}
                tracking={tracking}
                isPolling={false}
                onTrack={handleTrack}
                onShowMyTickets={handleShowMyTickets}
                onNewTicket={handleNewTicket}
                onHome={handleHome}
                onLeaveQueue={handleLeaveQueue}
              />
            </motion.div>
          )}

          {step === 'myTickets' && (
            <motion.div
              key="myTickets"
              custom={direction}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={pageTransition}
            >
              <MyTicketsView
                tickets={myTickets}
                loading={loadingMyTickets}
                onBack={() => goTo('confirmation', -1)}
                onSelectTicket={handleSelectTicketFromWallet}
                customerPhone={ticket?.customerPhone ?? undefined}
                tenantId={ticket?.tenantId ?? undefined}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-border/40 mt-auto">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="font-semibold text-emerald-600">QueueFlow</span>
        </p>
      </footer>
    </div>
  );
}