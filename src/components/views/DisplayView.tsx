'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Users, Timer, CheckCircle2, QrCode, Globe, ListOrdered } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app-store';
import { useQueueEvents } from '@/hooks/use-queue-events';
import { useLocale } from '@/lib/i18n';
import { announceTicket, preloadVoices } from '@/lib/voice';
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
interface WaitingTicket {
  serialNumber: number;
  customerName: string;
}

function formatSerial(queue: Queue): string {
  const num = String(queue.nowServingSerial).padStart(3, '0');
  return `${queue.prefix}-${num}`;
}

function formatSerialFromParts(prefix: string, serialNumber: number): string {
  return `${prefix}-${String(serialNumber).padStart(3, '0')}`;
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
/*  Language Switcher                                                  */
/* ------------------------------------------------------------------ */
function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
      className="h-8 px-2.5 gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg border border-slate-800/60"
    >
      <Globe className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">{locale === 'en' ? 'বাংলা' : 'English'}</span>
    </Button>
  );
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
  const { lastEvent, clearLastEvent } = useQueueEvents(tenantId);
  const { locale, t } = useLocale();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [flashActive, setFlashActive] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState<CompletedTicket[]>([]);
  const [activeQueueIdx, setActiveQueueIdx] = useState(0);

  const accentColor = branding?.primaryColor || '#10b981';

  // Preload TTS voices on mount
  useEffect(() => {
    preloadVoices();
    // Also listen for voiceschanged event
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', preloadVoices);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', preloadVoices);
    }
  }, []);

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

  // Group queues by location name for the status grid
  const allLocationNames = useMemo(() => [...new Set(queues.map(q => q.location?.name || 'General'))], [queues]);
  const [activeLocationFilter, setActiveLocationFilter] = useState<string>('all');
  const filteredQueues = activeLocationFilter === 'all' ? queues : queues.filter(q => (q.location?.name || 'General') === activeLocationFilter);
  const { groupedQueues, locationTags } = useMemo(() => {
    const grouped = filteredQueues.reduce<Record<string, typeof queues>>((acc, q) => {
      const tag = q.location?.name || 'General';
      if (!acc[tag]) acc[tag] = [];
      acc[tag].push(q);
      return acc;
    }, {});
    const tags = Object.keys(grouped).sort((a, b) => {
      if (a === 'General') return 1;
      if (b === 'General') return -1;
      return a.localeCompare(b);
    });
    return { groupedQueues: grouped, locationTags: tags };
  }, [filteredQueues]);

  // Fetch active breaks every 15 seconds
  const [activeBreaks, setActiveBreaks] = useState<{ reason: string; level: string }[]>([]);
  useEffect(() => {
    const fetchBreaks = async () => {
      try {
        const res = await fetch(`/api/breaks?tenantId=${tenantId}`);
        if (res.ok) {
          const data = await res.json();
          const active = (data.breaks ?? []).filter((b: { isActive: boolean }) => b.isActive);
          setActiveBreaks(active.map((b: { reason: string | null; level: string }) => ({ reason: b.reason || 'Break', level: b.level })));
        }
      } catch { /* silent */ }
    };
    fetchBreaks();
    const interval = setInterval(fetchBreaks, 15000);
    return () => clearInterval(interval);
  }, [tenantId]);

  useEffect(() => {
    if (queues.length <= 1) return;
    const interval = setInterval(() => {
      setActiveQueueIdx((prev) => (prev + 1) % queues.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [queues.length]);

  /* Handle real-time events (SSE or polling) */
  useEffect(() => {
    if (!lastEvent) return;

    // Defer all setState calls to microtask to satisfy lint
    queueMicrotask(() => {
      if (lastEvent.type === 'TICKET_CALLED') {
        playChime();
        setFlashActive(true);
        fetchTenantData();
        // Find the queue that was called and focus it
        const queueId = lastEvent.payload?.queueId as string | undefined;
        if (queueId) {
          const idx = queues.findIndex((q) => q.id === queueId);
          if (idx >= 0) {
            setActiveQueueIdx(idx);
            // Voice announcement — serialNumber in payload is pre-formatted (e.g. "A-042")
            const calledQueue = queues[idx];
            const serialStr = lastEvent.payload?.serialNumber as string | undefined;
            if (serialStr && calledQueue) {
              announceTicket({
                serial: serialStr,
                queueName: calledQueue.name,
                locale,
              });
            }
          }
        }
        setTimeout(() => setFlashActive(false), 1200);
      }

      if (lastEvent.type === 'TICKET_COMPLETED') {
        const payload = lastEvent.payload ?? {};
        const serialStr = payload.serialNumber as string | undefined;
        const queueName = payload.queueName as string | undefined;
        const ticketId = payload.ticketId as string | undefined;

        if (serialStr && ticketId) {
          setRecentlyCompleted((prev) => {
            const updated = [
              { id: ticketId, formattedSerial: serialStr, queueName: queueName || '', completedAt: Date.now() },
              ...prev,
            ].slice(0, 10);
            return updated;
          });
        }
        fetchTenantData();
      }

      if (lastEvent.type === 'TICKET_CREATED' || lastEvent.type === 'QUEUE_UPDATE') {
        fetchTenantData();
      }
    });

    clearLastEvent();
  }, [lastEvent, clearLastEvent, fetchTenantData, queues, locale]);

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

  // Get waiting ticket serials for active queue
  const activeWaitingTickets: WaitingTicket[] = (activeQueue as unknown as { _waitingSerials?: WaitingTicket[] })?._waitingSerials ?? [];

  const dateStr = currentTime.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', {
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

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-slate-400">
            <Users className="w-5 h-5" />
            <span className="text-lg">
              <span className="text-white font-semibold">{totalWaiting}</span> {t('time.waiting').toLowerCase()}
            </span>
          </div>
          <LanguageSwitcher />
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
                className="flex flex-col items-center w-full max-w-5xl"
              >
                <p className="text-2xl font-semibold uppercase tracking-[0.3em] text-slate-400 mb-4">
                  {t('display.nowServing')}
                </p>

                {/* Multi-counter serving panels OR single big ticket number */}
                {activeQueue._servingTickets && activeQueue._servingTickets.length > 1 ? (
                  /* Multiple counters active — show grid of counter panels */
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4 w-full">
                    {activeQueue._servingTickets.map((st) => (
                      <div
                        key={st.counterId || st.ticketId}
                        className="rounded-xl border-2 px-4 py-5 text-center"
                        style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}08` }}
                      >
                        {st.counterName && st.counterName !== 'Counter' && (
                          <p className="text-xs font-medium text-slate-500 mb-1">{st.counterName}</p>
                        )}
                        <motion.p
                          className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono leading-none"
                          style={{ color: accentColor }}
                          animate={
                            flashActive
                              ? {
                                  textShadow: [
                                    `0 0 20px ${accentColor}80`,
                                    `0 0 40px ${accentColor}40`,
                                    `0 0 0px transparent`,
                                  ],
                                }
                              : { textShadow: '0 0 0px transparent' }
                          }
                          transition={{ duration: 0.8 }}
                        >
                          {formatSerialFromParts(activeQueue.prefix, st.serialNumber)}
                        </motion.p>
                        {st.customerName && (
                          <p className="text-sm text-slate-400 mt-2 truncate">{st.customerName}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Single counter / no counters — show big number */
                  <>
                    <div
                      className="relative rounded-2xl border-2 px-16 py-8 mb-4"
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
                    {/* Show counter name if serving at a specific counter */}
                    {activeQueue._servingTickets?.[0]?.counterName && activeQueue._servingTickets[0].counterName !== 'Counter' && (
                      <p className="text-sm text-slate-500 -mt-2 mb-3">
                        {activeQueue._servingTickets[0].counterName}
                        {activeQueue._servingTickets[0].customerName && ` — ${activeQueue._servingTickets[0].customerName}`}
                      </p>
                    )}
                  </>
                )}

                {/* Queue + Counter + Waiting info */}
                <div className="flex items-center gap-3 flex-wrap justify-center mb-4">
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-400 text-sm">{locale === 'bn' ? 'কিউ:' : 'Queue:'}</span>
                    <span className="text-white font-semibold text-lg">{activeQueue.name}</span>
                  </div>
                  {/* Active counters badge */}
                  {(activeQueue._activeCounterCount ?? 0) > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
                      <ListOrdered className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold text-sm">
                        {activeQueue._activeCounterCount} {activeQueue._activeCounterCount === 1 ? (locale === 'bn' ? 'কাউন্টার' : 'Counter') : (locale === 'bn' ? 'কাউন্টার' : 'Counters')}
                      </span>
                    </div>
                  )}
                  {(activeQueue._waitingCount ?? 0) > 0 && (
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-400 text-sm">{t('display.nextUp')}:</span>
                      <span className={waitColor(activeQueue._waitingCount ?? 0)}>
                        <span className="font-semibold text-lg">{activeQueue._waitingCount}</span>
                        <span className="text-sm ml-1">{t('time.waiting').toLowerCase()}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* ---- WAITING TICKET SERIALS ---- */}
                {activeWaitingTickets.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="w-full max-w-3xl"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px flex-1 bg-slate-800/60" />
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-3">
                        {t('display.waitingTickets')}
                      </span>
                      <div className="h-px flex-1 bg-slate-800/60" />
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {activeWaitingTickets.map((wt, idx) => (
                        <motion.span
                          key={wt.serialNumber}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.03 * idx, duration: 0.25 }}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800/60 text-base font-bold font-mono"
                          style={{ color: accentColor }}
                        >
                          {formatSerialFromParts(activeQueue.prefix, wt.serialNumber)}
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Welcome / announcement */}
          {(welcomeMessage || branding?.welcomeMessage) ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 text-lg text-slate-500 text-center max-w-2xl"
            >
              {welcomeMessage || branding?.welcomeMessage}
            </motion.p>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 text-lg text-slate-600 text-center"
            >
              {t('display.pleaseReady')}
            </motion.p>
          )}
        </section>

        {/* ---- QUEUE STATUS GRID ---- */}
        {queues.length > 0 && (
          <section className="shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold uppercase tracking-widest text-slate-500">
                {t('queue.status')}
              </h2>
              <div className="flex-1 h-px bg-slate-800/60" />
              {/* Location filter tabs */}
              {allLocationNames.length > 1 && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveLocationFilter('all')}
                    className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      activeLocationFilter === 'all'
                        ? 'text-white'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                    style={activeLocationFilter === 'all' ? { backgroundColor: accentColor } : undefined}
                  >
                    All
                  </button>
                  {allLocationNames.map(loc => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setActiveLocationFilter(loc)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                        activeLocationFilter === loc
                          ? 'text-white'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                      style={activeLocationFilter === loc ? { backgroundColor: accentColor } : undefined}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ScrollArea className="w-full">
              <div className="space-y-3 pb-2">
                {locationTags.map(tag => (
                  <div key={tag}>
                    {locationTags.length > 1 && (
                      <div className="flex items-center gap-2 py-1">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{tag}</span>
                        <div className="flex-1 h-px bg-slate-800/60" />
                      </div>
                    )}
                    <div className="flex gap-4">
                      {groupedQueues[tag].map((queue) => (
                        <motion.div
                          key={queue.id}
                          whileHover={{ y: -2 }}
                          className={`shrink-0 w-56 rounded-xl border p-4 transition-colors ${
                            activeQueue?.id === queue.id
                              ? 'border-slate-600 bg-slate-800/60'
                              : 'border-slate-800/60 bg-slate-900/60'
                          }`}
                          style={
                            activeQueue?.id === queue.id
                              ? { boxShadow: `0 0 20px ${accentColor}10` }
                              : undefined
                          }
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-white truncate">{queue.name}</h3>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {queue.joinPaused && (
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">Paused</span>
                              )}
                              <Badge
                                variant="outline"
                                className="border-slate-700 text-slate-400 text-xs shrink-0"
                              >
                                {queue.prefix}
                              </Badge>
                            </div>
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
                              <span className="text-slate-500">{t('time.waiting')}:</span>
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
                  </div>
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
          <span className="text-[10px] font-medium">{t('display.scanToJoin')}</span>
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

      {/* Break Overlay — ROOM level breaks */}
      {activeBreaks.some(b => b.level === 'ROOM') && (
        <div className="fixed inset-0 z-30 bg-amber-500/20 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-4xl sm:text-5xl font-bold text-amber-400 uppercase tracking-[0.3em] mb-3">
              ON BREAK
            </p>
            <p className="text-lg text-amber-300/80">
              {activeBreaks.filter(b => b.level === 'ROOM').map(b => b.reason).join(', ')}
            </p>
          </div>
        </div>
      )}
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