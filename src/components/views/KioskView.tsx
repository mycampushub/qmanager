'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Loader2, Hash, Users, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { Tenant, Queue, Ticket } from '@/lib/types';

// ─── TYPES ──────────────────────────────────────────────────
type KioskStep = 'tenant-select' | 'queue-select' | 'check-in' | 'ticket-display';

interface KioskTicketData {
  ticket: Ticket;
  tenantName: string;
  queueName: string;
  position: number;
  estimatedWait: number;
}

// ─── AUDIO FEEDBACK ────────────────────────────────────────
function playSuccessChime() {
  try {
    const ctx = new AudioContext();
    // First tone (lower)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 523.25; // C5
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    // Second tone (higher)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 659.25; // E5
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.6);
  } catch {
    // Silently fail if AudioContext isn't available
  }
}

// ─── PRINT CSS (injected once) ──────────────────────────────
function PrintStyles() {
  return (
    <style>{`
      @media print {
        body * {
          visibility: hidden !important;
        }
        #kiosk-receipt, #kiosk-receipt * {
          visibility: visible !important;
        }
        #kiosk-receipt {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 80mm !important;
          margin: 0 auto !important;
          padding: 8mm 4mm !important;
          font-family: 'Courier New', monospace !important;
          font-size: 12px !important;
          color: #000 !important;
          background: #fff !important;
          box-sizing: border-box !important;
        }
        #kiosk-receipt .receipt-header {
          text-align: center !important;
          border-bottom: 1px dashed #000 !important;
          padding-bottom: 8px !important;
          margin-bottom: 8px !important;
        }
        #kiosk-receipt .receipt-header h2 {
          font-size: 16px !important;
          font-weight: bold !important;
          margin: 0 !important;
        }
        #kiosk-receipt .receipt-number {
          text-align: center !important;
          font-size: 48px !important;
          font-weight: bold !important;
          margin: 16px 0 !important;
        }
        #kiosk-receipt .receipt-row {
          display: flex !important;
          justify-content: space-between !important;
          padding: 4px 0 !important;
          border-bottom: 1px dotted #ccc !important;
        }
        #kiosk-receipt .receipt-footer {
          text-align: center !important;
          margin-top: 12px !important;
          border-top: 1px dashed #000 !important;
          padding-top: 8px !important;
          font-size: 10px !important;
        }
      }
    `}</style>
  );
}

// ─── TENANT SELECT SCREEN ───────────────────────────────────
function TenantSelectScreen({ tenants, onSelect }: { tenants: Tenant[]; onSelect: (t: Tenant) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-800 p-6">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-3xl text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-2">QueueFlow</h1>
        <p className="text-emerald-100 text-lg mb-10">Select your business to join the queue</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {tenants.map((t) => (
            <motion.button
              key={t.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(t)}
              className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 text-left transition-colors hover:bg-white/20"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center text-white text-xl font-bold shrink-0">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{t.name}</h3>
                  <p className="text-emerald-200 text-sm">{t._queueCount ?? 0} queue{t._queueCount !== 1 ? 's' : ''} available</p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
        {tenants.length === 0 && (
          <p className="text-white/70 text-lg">No businesses available for kiosk check-in.</p>
        )}
      </motion.div>
    </div>
  );
}

// ─── QUEUE SELECT SCREEN ────────────────────────────────────
function QueueSelectScreen({ tenant, queues, onSelect, onBack }: { tenant: Tenant; queues: Queue[]; onSelect: (q: Queue) => void; onBack: () => void }) {
  const formatEWT = (sec: number) => {
    if (sec <= 0) return 'No wait';
    const m = Math.floor(sec / 60);
    return m > 0 ? `~${m} min` : '< 1 min';
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-800 p-6">
      <div className="text-center pt-8 pb-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-white">{tenant.name}</h1>
        <p className="text-emerald-100 mt-2">Select a queue to join</p>
      </div>
      <div className="flex-1 flex items-start justify-center">
        <div className="w-full max-w-2xl grid sm:grid-cols-2 gap-4">
          {queues.map((q) => (
            <motion.button
              key={q.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(q)}
              className="bg-white rounded-2xl p-6 text-left shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 text-lg font-bold">
                    {q.prefix}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{q.name}</h3>
                    {q.description && <p className="text-sm text-muted-foreground">{q.description}</p>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{q._waitingCount ?? 0} waiting</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatEWT(q._ewt ?? 0)}</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
      <div className="text-center py-6">
        <button onClick={onBack} className="text-white/70 hover:text-white text-sm underline">
          ← Go back
        </button>
      </div>
    </div>
  );
}

// ─── CHECK-IN FORM ──────────────────────────────────────────
function CheckInScreen({ tenant, queue, onSubmit, onBack }: {
  tenant: Tenant;
  queue: Queue;
  onSubmit: (name: string, phone: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }
    setLoading(true);
    try {
      await onSubmit(name.trim(), phone.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-800 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
            {queue.prefix}
          </div>
          <h1 className="text-3xl font-bold text-white">{queue.name}</h1>
          <p className="text-emerald-100 mt-1">{tenant.name}</p>
        </div>
        <Card className="shadow-2xl">
          <CardContent className="pt-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="kiosk-name" className="text-sm font-medium text-foreground">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <Input
                  id="kiosk-name"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-16 text-2xl text-center"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="kiosk-phone" className="text-sm font-medium text-foreground">
                  Phone Number <span className="text-muted-foreground text-xs">(optional)</span>
                </label>
                <Input
                  id="kiosk-phone"
                  type="tel"
                  placeholder="+880 1XXX XXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-16 text-2xl text-center"
                />
              </div>
              <Button type="submit" className="w-full h-14 text-xl bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading && <Loader2 className="w-6 h-6 mr-2 animate-spin" />}
                Join Queue
              </Button>
            </form>
            <div className="mt-4 text-center">
              <button onClick={onBack} className="text-muted-foreground hover:text-foreground text-sm underline">
                ← Go back
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── TICKET DISPLAY SCREEN ──────────────────────────────────
function TicketDisplayScreen({ data, onPrint, onTimeout }: { data: KioskTicketData; onPrint: () => void; onTimeout: () => void }) {
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onTimeout]);

  const formatEWT = (sec: number) => {
    const m = Math.floor(sec / 60);
    return m > 0 ? `~${m} min` : '< 1 min';
  };

  const statusColors: Record<string, string> = {
    WAITING: 'bg-amber-100 text-amber-700',
    SERVING: 'bg-emerald-100 text-emerald-700',
    COMPLETED: 'bg-slate-100 text-slate-700',
  };

  const formattedSerial = `${data.ticket.queue?.prefix || 'A'}-${String(data.ticket.serialNumber).padStart(3, '0')}`;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-800 p-6">
      {/* Hidden receipt for printing */}
      <div id="kiosk-receipt" style={{ display: 'none' }}>
        <div className="receipt-header">
          <h2>{data.tenantName}</h2>
          <p>{data.queueName}</p>
        </div>
        <div className="receipt-number">{formattedSerial}</div>
        <div className="receipt-row">
          <span>Customer</span>
          <span>{data.ticket.customerName}</span>
        </div>
        <div className="receipt-row">
          <span>Date</span>
          <span>{new Date(data.ticket.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="receipt-row">
          <span>Time</span>
          <span>{new Date(data.ticket.createdAt).toLocaleTimeString()}</span>
        </div>
        <div className="receipt-row">
          <span>Position</span>
          <span>#{data.position}</span>
        </div>
        <div className="receipt-row">
          <span>Est. Wait</span>
          <span>{formatEWT(data.estimatedWait)}</span>
        </div>
        <div className="receipt-footer">
          Thank you for choosing {data.tenantName}.<br />
          Please wait for your number to be called.
        </div>
      </div>

      {/* Visible display */}
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center w-full max-w-lg">
        <p className="text-emerald-100 text-lg mb-2">{data.tenantName}</p>
        <p className="text-emerald-200 text-sm mb-6">{data.queueName}</p>

        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 mb-8">
          <p className="text-sm text-muted-foreground uppercase tracking-widest mb-2">Your Ticket</p>
          <p className="text-8xl sm:text-9xl font-bold text-emerald-600 leading-none mb-4">
            {formattedSerial}
          </p>
          <Badge className={statusColors[data.ticket.status] || 'bg-slate-100 text-slate-700'}>{data.ticket.status}</Badge>

          <div className="mt-8 space-y-3">
            <div className="flex justify-between text-lg px-2">
              <span className="text-muted-foreground">Position</span>
              <span className="font-semibold">#{data.position} in line</span>
            </div>
            <div className="flex justify-between text-lg px-2">
              <span className="text-muted-foreground">Est. Wait</span>
              <span className="font-semibold">{formatEWT(data.estimatedWait)}</span>
            </div>
            <div className="flex justify-between text-lg px-2">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-semibold">{data.ticket.customerName}</span>
            </div>
          </div>
        </div>

        <Button onClick={onPrint} className="h-16 px-12 text-xl bg-white text-emerald-700 hover:bg-white/90 shadow-lg">
          <Printer className="w-6 h-6 mr-2" />
          Print Ticket
        </Button>

        <p className="text-emerald-200/60 text-sm mt-6">Auto-reset in {countdown}s</p>
      </motion.div>
    </div>
  );
}

// ─── MAIN KIOSK VIEW ────────────────────────────────────────
export default function KioskView() {
  const { tenants } = useAppStore();
  const [step, setStep] = useState<KioskStep>('tenant-select');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [tenantQueues, setTenantQueues] = useState<Queue[]>([]);
  const [ticketData, setTicketData] = useState<KioskTicketData | null>(null);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [queueError, setQueueError] = useState(false);
  const [joining, setJoining] = useState(false);
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef(step);

  stepRef.current = step;

  // Reset to entry on inactivity (60s)
  const resetInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      if (stepRef.current !== 'tenant-select') {
        resetKiosk();
      }
    }, 60000);
  }, []);

  useEffect(() => {
    // Touch/mouse/click resets inactivity timer
    const handler = () => resetInactivity();
    window.addEventListener('touchstart', handler);
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', handler);
    resetInactivity();
    return () => {
      window.removeEventListener('touchstart', handler);
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', handler);
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
  }, [resetInactivity]);

  const resetKiosk = useCallback(() => {
    setStep('tenant-select');
    setSelectedTenant(null);
    setSelectedQueue(null);
    setTenantQueues([]);
    setTicketData(null);
    resetInactivity();
  }, [resetInactivity]);

  const handleTenantSelect = useCallback(async (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setLoadingQueues(true);
    setStep('queue-select');
    resetInactivity();
    try {
      const res = await fetch(`/api/tenants/${tenant.id}/queues`);
      const data = await res.json();
      if (data.queues) {
        const activeQueues = (data.queues as Queue[]).filter(q => q.isActive);
        setTenantQueues(activeQueues);
        if (activeQueues.length === 1) {
          // Auto-select if only one queue
          setSelectedQueue(activeQueues[0]);
          setStep('check-in');
        }
      }
    } catch {
      toast.error('Failed to load queues');
      setQueueError(true);
    } finally {
      setLoadingQueues(false);
    }
  }, [resetInactivity]);

  const handleQueueSelect = useCallback((queue: Queue) => {
    setSelectedQueue(queue);
    setStep('check-in');
    resetInactivity();
  }, [resetInactivity]);

  const handleCheckIn = useCallback(async (name: string, phone: string) => {
    if (!selectedTenant || !selectedQueue) return;
    setJoining(true);
    try {
      const res = await fetch('/api/queues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          queueId: selectedQueue.id,
          customerName: name,
          customerPhone: phone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to join queue');
        return;
      }
      // Use server-provided position if available (accounts for cancelled/skipped), fallback to serial delta
      const position = (data.ticket as Record<string, unknown>)._peopleAhead != null
        ? Math.max(1, (data.ticket as Record<string, unknown>)._peopleAhead as number)
        : Math.max(1, data.ticket.serialNumber - (data.ticket.queue?.nowServingSerial || 0));
      setTicketData({
        ticket: data.ticket,
        tenantName: selectedTenant.name,
        queueName: selectedQueue.name,
        position,
        estimatedWait: data.estimatedWaitTime ?? position * (selectedQueue.defaultServiceTimeSec || 300),
      });
      setStep('ticket-display');
      playSuccessChime();
      resetInactivity();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setJoining(false);
    }
  }, [selectedTenant, selectedQueue, resetInactivity]);

  const handlePrint = useCallback(() => {
    window.print();
    // Auto-reset after 5 seconds
    setTimeout(() => {
      resetKiosk();
    }, 5000);
  }, [resetKiosk]);

  const handleTimeout = useCallback(() => {
    resetKiosk();
  }, [resetKiosk]);

  // Fullscreen style
  return (
    <>
      <PrintStyles />
      <div className="fixed inset-0 overflow-auto" style={{ cursor: 'default' }}>
        <AnimatePresence mode="wait">
          {step === 'tenant-select' && (
            <motion.div key="tenant-select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-full">
              <TenantSelectScreen tenants={tenants} onSelect={handleTenantSelect} />
            </motion.div>
          )}
          {step === 'queue-select' && selectedTenant && (
            <motion.div key="queue-select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-full">
              {loadingQueues ? (
                <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-800">
                  <Loader2 className="w-10 h-10 animate-spin text-white" />
                </div>
              ) : queueError ? (
                <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-emerald-600 to-emerald-800 p-6">
                  <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Connection Error</h2>
                    <p className="text-emerald-100 mb-6">Unable to load queues. Please check your connection and try again.</p>
                    <Button
                      onClick={() => { setQueueError(false); handleTenantSelect(selectedTenant!); }}
                      className="bg-white text-emerald-700 hover:bg-white/90 h-14 px-8 text-lg"
                      aria-label="Retry loading queues"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Try Again
                    </Button>
                    <button
                      onClick={() => { setStep('tenant-select'); setQueueError(false); resetInactivity(); }}
                      className="text-white/70 hover:text-white text-sm underline mt-4 inline-block"
                      aria-label="Go back to tenant selection"
                    >
                      ← Go back
                    </button>
                  </div>
                </div>
              ) : (
                <QueueSelectScreen tenant={selectedTenant} queues={tenantQueues} onSelect={handleQueueSelect} onBack={() => { setStep('tenant-select'); resetInactivity(); }} />
              )}
            </motion.div>
          )}
          {step === 'check-in' && selectedTenant && selectedQueue && (
            <motion.div key="check-in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-full">
              <CheckInScreen tenant={selectedTenant} queue={selectedQueue} onSubmit={handleCheckIn} onBack={() => { setStep('queue-select'); resetInactivity(); }} />
            </motion.div>
          )}
          {step === 'ticket-display' && ticketData && (
            <motion.div key="ticket-display" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="min-h-full">
              <TicketDisplayScreen data={ticketData} onPrint={handlePrint} onTimeout={handleTimeout} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}