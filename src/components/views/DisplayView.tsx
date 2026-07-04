'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Users, Timer, CheckCircle2, QrCode } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/stores/app-store';
import { useQueueWebSocket } from '@/hooks/use-queue-ws';
import type { Tenant, Queue, BrandingConfig } from '@/lib/types';
import { QRCodeDisplay } from '@/components/QRCode';

/* ------------------------------------------------------------------ */
/*  Audio chime via Web Audio API (singleton AudioContext)             */
/* ------------------------------------------------------------------ */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playChime() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    // Silently fail if AudioContext isn't available
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatSerial(queue: Queue): string {
  const num = String(queue.nowServingSerial).padStart(3, '0');
  return `${queue.prefix}-${num}`;
}

function formatEwt(seconds: number): string {
  if (seconds <= 0) return '0 min';
  if (seconds < 60) return '< 1 min';
  return `~${Math.ceil(seconds / 60)} min`;
}

function waitColor(count: number): string {
  if (count <= 3) return 'text-emerald-400';
  if (count <= 7) return 'text-amber-400';
  return 'text-red-400';
}


/* ------------------------------------------------------------------ */
/*  Flash overlay that fires on TICKET_CALLED                          */
/* ------------------------------------------------------------------ */
function FlashOverlay({ active, accentColor }: { active: boolean; accentColor: string }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="fixed inset-0 z-50 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at center, ${accentColor}22 0%, transparent 70%)` }}
        />
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Recently Completed Ticker                                          */
/* ------------------------------------------------------------------ */
interface CompletedTicket {
  id: string;
  formattedSerial: string;
  queueName: string;
  completedAt: number;
}

function TickerBar({ items, accentColor }: { items: CompletedTicket[]; accentColor: string }) {
  if (items.length === 0) return null;

  return (
    <div
      className="w-full overflow-hidden border-t border-slate-800/60"
      style={{ backgroundColor: `${accentColor}08` }}
    >
      <div className="flex items-center h-16">
        <div className="shrink-0 px-5 h-full flex items-center gap-2 border-r border-slate-800/60 bg-slate-900/80">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Completed</span>
        </div>
        <div className="overflow-hidden flex-1 relative">
          <motion.div
            className="flex items-center gap-8 whitespace-nowrap px-4"
            animate={{ x: ['0%', '-50%'] }}
            transition={{
              x: {
                repeat: Infinity,
                repeatType: 'loop',
                duration: items.length * 4,
                ease: 'linear',
              },
            }}
          >
            {/* Duplicate items for seamless loop */}
            {[...items, ...items].map((item, idx) => (
              <div key={`${item.id}-${idx}`} className="flex items-center gap-2 shrink-0">
                <span
                  className="text-lg font-bold font-mono"
                  style={{ color: accentColor }}
                >
                  {item.formattedSerial}
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm text-slate-600">{item.queueName}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main TV Display                                                    */
/* ------------------------------------------------------------------ */
function MainDisplay({ tenantId }: { tenantId: string }) {
  const { setDisplayTenantId, setCurrentView } = useAppStore();
  const { lastEvent, clearLastEvent } = useQueueWebSocket(tenantId);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [flashActive, setFlashActive] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState<CompletedTicket[]>([]);
  const [activeQueueIdx, setActiveQueueIdx] = useState(0);

  const accentColor = branding?.primaryColor || '#10b981';

  /* Clock tick */
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  /* Fetch tenant + branding (both public, no auth needed) */
  const fetchTenantData = useCallback(async () => {
    try {
      const [tenantRes, brandingRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/display`),
        fetch(`/api/tenants/branding?tenantId=${tenantId}`),
      ]);

      if (tenantRes.ok) {
        const data = await tenantRes.json();
        setTenant(data.tenant);
      }
      if (brandingRes.ok) {
        const data = await brandingRes.json();
        setBranding(data.branding);
        setWelcomeMessage(data.welcomeMessage);
      }
    } catch {
      // silently handle
    }
  }, [tenantId]);

  /* Initial fetch — hook polling (3s) handles subsequent refreshes */
  useEffect(() => {
    fetchTenantData();
  }, [fetchTenantData]);

  /* Rotate active queue for the big "NOW SERVING" display */
  const queues = useMemo(() => tenant?._queues ?? [], [tenant]);

  useEffect(() => {
    if (queues.length <= 1) return;
    const interval = setInterval(() => {
      setActiveQueueIdx((prev) => (prev + 1) % queues.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [queues.length]);

  /* Handle WebSocket events */
  useEffect(() => {
    if (!lastEvent) return;

    // Defer all setState calls to microtask to satisfy lint
    queueMicrotask(() => {
      if (lastEvent.event === 'TICKET_CALLED') {
        playChime();
        setFlashActive(true);
        fetchTenantData();
        // Find the queue that was called and focus it
        const queueId = lastEvent.payload.queueId as string | undefined;
        if (queueId) {
          const idx = queues.findIndex((q) => q.id === queueId);
          if (idx >= 0) setActiveQueueIdx(idx);
        }
        setTimeout(() => setFlashActive(false), 1200);
      }

      if (lastEvent.event === 'TICKET_COMPLETED') {
        const payload = lastEvent.payload;
        const serialNumber = payload.serialNumber as number | undefined;
        const prefix = payload.prefix as string | undefined;
        const queueName = payload.queueName as string | undefined;
        const ticketId = payload.ticketId as string | undefined;

        if (serialNumber && prefix && ticketId) {
          const formattedSerial = `${prefix}-${String(serialNumber).padStart(3, '0')}`;
          setRecentlyCompleted((prev) => {
            const updated = [
              { id: ticketId, formattedSerial, queueName: queueName || '', completedAt: Date.now() },
              ...prev,
            ].slice(0, 10);
            return updated;
          });
        }
        fetchTenantData();
      }

      if (lastEvent.event === 'TICKET_CREATED' || lastEvent.event === 'QUEUE_UPDATE') {
        fetchTenantData();
      }
    });

    clearLastEvent();
  }, [lastEvent, clearLastEvent, fetchTenantData, queues]);

  /* Prune old completed tickets after 30 min */
  useEffect(() => {
    const interval = setInterval(() => {
      setRecentlyCompleted((prev) =>
        prev.filter((t) => Date.now() - t.completedAt < 30 * 60 * 1000)
      );
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!tenant) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const activeQueue = queues[activeQueueIdx];
  const totalWaiting = queues.reduce((sum, q) => sum + (q._waitingCount ?? 0), 0);
  const dateStr = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-white overflow-hidden relative select-none">
      <FlashOverlay active={flashActive} accentColor={accentColor} />

      {/* Ambient background glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[160px] opacity-20 pointer-events-none"
        style={{ background: accentColor }}
      />

      {/* ---- HEADER ---- */}
      <header className="relative z-10 flex items-center justify-between px-10 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl text-white"
            style={{ backgroundColor: accentColor }}
          >
            {tenant.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{tenant.name}</h1>
            {tenant.masterTenant && (
              <p className="text-sm text-slate-500">{tenant.masterTenant.corporateName}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2 text-slate-400">
            <Users className="w-5 h-5" />
            <span className="text-lg">
              <span className="text-white font-semibold">{totalWaiting}</span> waiting
            </span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-mono font-semibold tabular-nums" style={{ color: accentColor }}>
              {timeStr}
            </p>
            <p className="text-sm text-slate-500">{dateStr}</p>
          </div>
        </div>
      </header>

      {/* ---- MAIN CONTENT ---- */}
      <main className="relative z-10 flex-1 flex flex-col px-10 py-6 gap-6 overflow-hidden">

        {/* NOW SERVING hero */}
        <section className="flex-1 flex flex-col items-center justify-center min-h-0">
          <AnimatePresence mode="wait">
            {activeQueue && (
              <motion.div
                key={activeQueue.id}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.9 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="flex flex-col items-center"
              >
                <p className="text-2xl font-semibold uppercase tracking-[0.3em] text-slate-400 mb-4">
                  Now Serving
                </p>

                {/* Big ticket number */}
                <div
                  className="relative rounded-2xl border-2 px-16 py-8 mb-6"
                  style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}08` }}
                >
                  <motion.p
                    className="text-[clamp(80px,12vw,160px)] font-black font-mono leading-none tracking-wider"
                    style={{ color: accentColor }}
                    animate={
                      flashActive
                        ? {
                            textShadow: [
                              `0 0 20px ${accentColor}80`,
                              `0 0 60px ${accentColor}40`,
                              `0 0 0px transparent`,
                            ],
                          }
                        : { textShadow: '0 0 0px transparent' }
                    }
                    transition={{ duration: 0.8 }}
                  >
                    {formatSerial(activeQueue)}
                  </motion.p>
                </div>

                {/* Queue + Window info */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-400 text-sm">Queue:</span>
                    <span className="text-white font-semibold text-lg">{activeQueue.name}</span>
                  </div>
                  {activeQueue._waitingCount !== undefined && activeQueue._waitingCount > 0 && (
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-400 text-sm">Next up:</span>
                      <span className={waitColor(activeQueue._waitingCount)}>
                        <span className="font-semibold text-lg">{activeQueue._waitingCount}</span>
                        <span className="text-sm ml-1">waiting</span>
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Welcome / announcement */}
          {(welcomeMessage || branding?.welcomeMessage) && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 text-lg text-slate-500 text-center max-w-2xl"
            >
              {welcomeMessage || branding?.welcomeMessage}
            </motion.p>
          )}
          {!welcomeMessage && !branding?.welcomeMessage && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 text-lg text-slate-600 text-center"
            >
              Please have your documents ready when your number is called. Thank you for your patience.
            </motion.p>
          )}
        </section>

        {/* ---- QUEUE STATUS GRID ---- */}
        {queues.length > 0 && (
          <section className="shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold uppercase tracking-widest text-slate-500">
                Queue Status
              </h2>
              <div className="flex-1 h-px bg-slate-800/60" />
            </div>

            <ScrollArea className="w-full">
              <div className="flex gap-4 pb-2">
                {queues.map((queue, idx) => (
                  <motion.div
                    key={queue.id}
                    whileHover={{ y: -2 }}
                    className={`shrink-0 w-56 rounded-xl border p-4 transition-colors ${
                      idx === activeQueueIdx
                        ? 'border-slate-600 bg-slate-800/60'
                        : 'border-slate-800/60 bg-slate-900/60'
                    }`}
                    style={
                      idx === activeQueueIdx
                        ? { boxShadow: `0 0 20px ${accentColor}10` }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-white truncate">{queue.name}</h3>
                      <Badge
                        variant="outline"
                        className="border-slate-700 text-slate-400 text-xs shrink-0"
                      >
                        {queue.prefix}
                      </Badge>
                    </div>

                    <p
                      className="text-3xl font-bold font-mono mb-3"
                      style={{ color: accentColor }}
                    >
                      {formatSerial(queue)}
                    </p>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-slate-500">Waiting:</span>
                        <span className={`font-semibold ${waitColor(queue._waitingCount ?? 0)}`}>
                          {queue._waitingCount ?? 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-slate-400 text-xs">
                          {formatEwt(queue._ewt ?? 0)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </section>
        )}
      </main>

      {/* ---- TICKER BAR ---- */}
      <TickerBar items={recentlyCompleted} accentColor={accentColor} />

      {/* QR Code — Scan to Join (bottom-right) */}
      <div className="fixed bottom-6 right-6 z-20 flex flex-col items-center gap-1.5 bg-slate-900/90 border border-slate-700/50 rounded-xl p-2.5 backdrop-blur-sm">
        <QRCodeDisplay
          value={`${window.location.origin}/?tenant=${tenant.id}`}
          size={90}
          bgColor="transparent"
          fgColor="#94a3b8"
        />
        <div className="flex items-center gap-1 text-slate-500">
          <QrCode className="w-3 h-3" />
          <span className="text-[10px] font-medium">Scan to Join</span>
        </div>
      </div>

      {/* Exit button (subtle, for admin use) */}
      <button
        onClick={() => {
          setDisplayTenantId(null);
          setCurrentView('marketing');
        }}
        className="fixed bottom-32 right-6 z-20 w-10 h-10 rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-600 hover:text-white hover:border-slate-600 transition-colors opacity-30 hover:opacity-100"
        aria-label="Exit display"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  No Tenant ID — redirect to marketing                               */
/* ------------------------------------------------------------------ */
function NoTenantRedirect() {
  const { setCurrentView } = useAppStore();

  useEffect(() => {
    // TV Display must be opened via direct link: /?display=<tenant-id>
    setCurrentView('marketing');
  }, [setCurrentView]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400">Redirecting...</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DisplayView – top-level export                                      */
/* ------------------------------------------------------------------ */
export default function DisplayView() {
  const displayTenantId = useAppStore((s) => s.displayTenantId);

  if (!displayTenantId) {
    return <NoTenantRedirect />;
  }

  return <MainDisplay tenantId={displayTenantId} />;
}