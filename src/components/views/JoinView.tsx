'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { Tenant, Queue, Ticket, TicketStatus, BrandingConfig } from '@/lib/types';

import { QRCodeDisplay } from '@/components/QRCode';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Users,
  Clock,
  TicketIcon,
  Loader2,
  Phone,
  User,
  Wallet,
  RefreshCw,
  QrCode,
  Timer,
  Hash,
  CircleDot,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
  LogOut,
  Star,
  History,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEwt(seconds: number): string {
  if (seconds <= 0) return 'Less than a minute';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

const STATUS_STYLES: Record<TicketStatus, { label: string; className: string; icon: React.ElementType }> = {
  WAITING: {
    label: 'Waiting',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: Clock,
  },
  SERVING: {
    label: 'Serving Now',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: CircleDot,
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle2,
  },
  SKIPPED: {
    label: 'Skipped',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
    icon: MinusCircle,
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-red-100 text-red-700 border-red-200',
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_STYLES[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 text-xs font-semibold ${cfg.className}`}>
      <Icon className="size-3.5" />
      {cfg.label}
    </Badge>
  );
}

function parseBranding(raw: string | null): BrandingConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BrandingConfig;
  } catch {
    return null;
  }
}

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
// Animation variants
// ---------------------------------------------------------------------------

const pageVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

const pageTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35 },
  }),
};

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
// Step 1 – Queue Selection & Check-in Form
// ---------------------------------------------------------------------------

function StepSelectQueue({
  tenant,
  queues,
  loading,
  joining,
  onJoin,
  onBack,
}: {
  tenant: Tenant;
  queues: Queue[];
  loading: boolean;
  joining: boolean;
  onJoin: (queueId: string, name: string, phone: string | undefined) => void;
  onBack: () => void;
}) {
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const branding = parseBranding(tenant.brandingConfig);
  const welcomeMsg = branding?.welcomeMessage || tenant.welcomeMessage;
  const primaryColor = branding?.primaryColor || '#059669';

  const handleSubmit = () => {
    if (!selectedQueue) {
      toast.error('Please select a queue');
      return;
    }
    if (!customerName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    const phone = customerPhone.trim() ? `+880${customerPhone.trim().replace(/^\\+?880/, '')}` : undefined;
    onJoin(selectedQueue, customerName.trim(), phone);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Tenant Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">{tenant.name}</h2>
        {welcomeMsg && (
          <p className="text-sm text-muted-foreground mt-1">{welcomeMsg}</p>
        )}
      </div>

      {/* Queue Selection */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">Select a Queue</Label>
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : queues.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded-xl">
            <p className="text-sm text-muted-foreground">No active queues available</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-56 overflow-y-auto">
            {queues.map((q, i) => (
              <motion.button
                key={q.id}
                custom={i}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                whileTap={{ scale: 0.97 }}
                className="w-full text-left"
                onClick={() => setSelectedQueue(q.id)}
              >
                <Card
                  className={`py-3.5 px-4 transition-all cursor-pointer border-2 ${
                    selectedQueue === q.id
                      ? 'bg-opacity-5 shadow-sm'
                      : 'border-transparent hover:bg-accent/50'
                  }`}
                  style={selectedQueue === q.id ? {
                    borderColor: primaryColor,
                    backgroundColor: `${primaryColor}0D`,
                  } : undefined}
                >
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                          style={selectedQueue === q.id ? { backgroundColor: primaryColor } : { backgroundColor: 'var(--muted)' }}
                        >
                          {q.prefix}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{q.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {q._waitingCount ?? 0} waiting
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Timer className="size-3" />
                          <span>{formatEwt(q._ewt ?? 0)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Check-in Form */}
      <div className="flex flex-col gap-4">
        <Label className="text-sm font-semibold">Your Details</Label>

        <div className="flex flex-col gap-2">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Your name *"
              className="pl-10 h-12 text-base"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={100}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <div className="absolute left-10 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium pointer-events-none">
              +880
            </div>
            <Input
              placeholder="Phone number (optional)"
              className="pl-[4.5rem] h-12 text-base"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              type="tel"
              inputMode="numeric"
              maxLength={10}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Add your phone to look up all your tickets later
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2.5 pt-1">
        <Button
          className="h-12 text-base font-semibold text-white w-full"
          style={{ backgroundColor: primaryColor }}
          onClick={handleSubmit}
          disabled={joining || !selectedQueue || !customerName.trim()}
        >
          {joining ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Getting Ticket…
            </>
          ) : (
            <>
              <TicketIcon className="size-4" />
              Get Ticket
            </>
          )}
        </Button>
        <Button variant="ghost" className="h-11 w-full" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Go Back
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 – Ticket Confirmation
// ---------------------------------------------------------------------------

function StepTicketConfirmation({
  ticket,
  tracking,
  isPolling,
  onTrack,
  onShowMyTickets,
  onNewTicket,
  onHome,
  onLeaveQueue,
}: {
  ticket: Ticket;
  tracking: boolean;
  isPolling: boolean;
  onTrack: () => void;
  onShowMyTickets: () => void;
  onNewTicket: () => void;
  onHome: () => void;
  onLeaveQueue: () => void;
}) {
  const queue = ticket.queue;
  const tenant = ticket.tenant;
  const serial = ticket._formattedSerial || `${queue?.prefix ?? '?'}-${String(ticket.serialNumber).padStart(3, '0')}`;
  const statusCfg = STATUS_STYLES[ticket.status];
  const StatusIcon = statusCfg.icon;
  const branding = parseBranding(tenant?.brandingConfig ?? null);
  const primaryColor = branding?.primaryColor || '#059669';

  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const isTerminal = ticket.status === 'COMPLETED' || ticket.status === 'SKIPPED' || ticket.status === 'CANCELLED';
  const isServing = ticket.status === 'SERVING';
  const peopleAhead = ticket._peopleAhead ?? 0;
  const ewt = ticket._ewt ?? 0;

  // Progress: higher is better. If serving → 90%, if completed → 100%, etc.
  const progressValue = (() => {
    if (ticket.status === 'COMPLETED') return 100;
    if (ticket.status === 'SERVING') return 90;
    if (ticket.status === 'SKIPPED' || ticket.status === 'CANCELLED') return 100;
    // WAITING: estimate based on position (if many ahead → lower)
    if (peopleAhead <= 0) return 80;
    // Rough estimate: 20% base + scaled by position
    return Math.max(10, Math.min(75, 80 - peopleAhead * 8));
  })();

  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      {/* Success Header */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 250, damping: 20 }}
        className="text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          {isPolling && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          )}
          <div
            className="inline-flex size-14 items-center justify-center rounded-full"
            style={{
              backgroundColor: isServing ? `${primaryColor}1A` : isTerminal ? '#f3f4f6' : '#fef3c7',
              color: isServing ? primaryColor : isTerminal ? '#6b7280' : '#d97706',
            }}
          >
            <StatusIcon className="size-7" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-foreground">
          {isServing
            ? 'It\'s Your Turn!'
            : isTerminal
              ? statusCfg.label
              : 'You\'re in the Queue!'}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {tenant?.name}
          {isPolling && (
            <span className="ml-2 text-xs text-emerald-600 font-medium">Live tracking active</span>
          )}
        </p>
      </motion.div>

      {/* Ticket Card */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        <Card className="overflow-hidden border-2" style={{ borderColor: `${primaryColor}33` }}>
          <div className="px-5 py-3" style={{ background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}CC)` }}>
            <div className="flex items-center justify-between">
              <span className="text-white/80 text-xs font-medium">{queue?.name ?? 'Queue'}</span>
              <StatusBadge status={ticket.status} />
            </div>
          </div>
          <CardContent className="p-5 flex flex-col items-center gap-4">
            {/* Big Ticket Number */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Your Ticket
              </p>
              <p className="text-5xl font-black tracking-tight text-foreground">{serial}</p>
              <p className="text-sm text-muted-foreground mt-1">
                for {ticket.customerName}
              </p>
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center gap-2">
              <QRCodeDisplay value={`${window.location.origin}/?ticket=${ticket.id}`} size={140} />
              <p className="text-xs text-muted-foreground text-center">
                Scan to track on another device
              </p>
            </div>

            <Separator className="w-full" />

            {/* Stats Row */}
            {!isTerminal && (
              <div className="grid grid-cols-3 gap-4 w-full text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Users className="size-3.5" />
                    <span className="text-xs">Ahead</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{peopleAhead}</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Clock className="size-3.5" />
                    <span className="text-xs">Est. Wait</span>
                  </div>
                  <p className="text-lg font-bold text-foreground">{formatEwt(ewt)}</p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Hash className="size-3.5" />
                    <span className="text-xs">Position</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">#{peopleAhead + 1}</p>
                </div>
              </div>
            )}

            {isTerminal && (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">
                  {ticket.status === 'COMPLETED'
                    ? 'Your service has been completed. Thank you!'
                    : ticket.status === 'CANCELLED'
                      ? 'This ticket has been cancelled.'
                      : 'This ticket was skipped. Please contact staff.'}
                </p>
              </div>
            )}

            {/* Feedback Form - shown after completion */}
            {ticket.status === 'COMPLETED' && (
              <FeedbackForm ticketId={ticket.id} tenantId={ticket.tenantId} primaryColor={primaryColor} />
            )}

            {/* Progress Bar */}
            {!isTerminal && (
              <div className="w-full">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Progress</span>
                  <span>{Math.round(progressValue)}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressValue}%`, backgroundColor: primaryColor }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Serving Alert */}
      {isServing && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: `${primaryColor}0D`, borderColor: `${primaryColor}33` }}
        >
          <AlertTriangle className="size-5 shrink-0 mt-0.5" style={{ color: primaryColor }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: primaryColor }}>Please proceed to the counter</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your ticket is now being served. Make your way to the service area.
            </p>
          </div>
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2.5">
        {!isTerminal && (
          <Button
            className="h-12 text-base font-semibold text-white w-full"
            style={{ backgroundColor: primaryColor }}
            onClick={onTrack}
            disabled={tracking}
          >
            {tracking ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Tracking Live…
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                Track Live
              </>
            )}
          </Button>
        )}

        {ticket.customerPhone && (
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={onShowMyTickets}
          >
            <Wallet className="size-4" />
            Check Other Tickets
          </Button>
        )}

        {ticket.status === 'WAITING' && (
          <Button
            variant="outline"
            className="h-11 w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setShowLeaveDialog(true)}
          >
            <LogOut className="size-4" />
            Leave Queue
          </Button>
        )}

        <Button variant="ghost" className="h-11 w-full" onClick={onHome}>
          <ArrowLeft className="size-4" />
          Back to Home
        </Button>
      </div>

      {/* Leave Queue Confirmation Dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Queue?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave the queue? Your ticket {serial} will be cancelled and you'll lose your position. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Waiting</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                setShowLeaveDialog(false);
                onLeaveQueue();
              }}
            >
              Leave Queue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 – My Tickets (Queue Wallet)
// ---------------------------------------------------------------------------

// Feedback Form Component
function FeedbackForm({ ticketId, tenantId, primaryColor }: { ticketId: string; tenantId: string; primaryColor: string }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) { toast.error('Please select a rating'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, tenantId, rating, comment: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Thank you for your feedback!');
        setSubmitted(true);
      } else {
        toast.error(data.error || 'Failed to submit feedback');
      }
    } catch { toast.error('Failed to submit feedback'); }
    finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="border rounded-xl p-4 bg-emerald-50 border-emerald-200 text-center">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
        <p className="text-sm font-medium text-emerald-700">Feedback submitted. Thank you!</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-amber-500" />
        <p className="text-sm font-semibold">Rate your experience</p>
      </div>
      <div className="flex items-center justify-center gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" onClick={() => setRating(s)} onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)} className="p-0.5 focus:outline-none" aria-label={`Rate ${s} star${s > 1 ? 's' : ''}`}>
            <Star className={`w-8 h-8 transition-colors ${s <= (hoverRating || rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
          </button>
        ))}
      </div>
      {rating > 0 && <p className="text-xs text-center text-muted-foreground">{rating === 1 ? 'Poor' : rating === 2 ? 'Fair' : rating === 3 ? 'Good' : rating === 4 ? 'Very Good' : 'Excellent'}</p>}
      <textarea className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none" placeholder="Share your experience (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
      <Button className="w-full h-10 text-sm" style={{ backgroundColor: primaryColor }} onClick={handleSubmit} disabled={submitting || rating === 0}>
        {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Star className="w-4 h-4 mr-1" />}
        {submitting ? 'Submitting...' : 'Submit Feedback'}
      </Button>
    </motion.div>
  );
}

// Customer History Component
function CustomerHistoryPanel({ phone, tenantId }: { phone: string; tenantId: string }) {
  const [profile, setProfile] = useState<{
    name: string | null;
    totalVisits: number;
    totalTickets: number;
    completedTickets: number;
    avgServiceTime: number | null;
    lastVisitAt: string | null;
    loyaltyTier: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/customer-profiles?phone=${encodeURIComponent(phone)}&tenantId=${tenantId}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setProfile(data?.profile ?? null);
        } else {
          if (!cancelled) setProfile(null);
        }
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [show, phone, tenantId]);

  if (!show) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setShow(true)}>
        <History className="w-4 h-4 mr-1" /> View Visit History
      </Button>
    );
  }

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-semibold">Visit History</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShow(false)} className="h-7 text-xs">Hide</Button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : profile ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-slate-50">
            <p className="text-lg font-bold">{profile.totalVisits}</p>
            <p className="text-xs text-muted-foreground">Visits</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-50">
            <p className="text-lg font-bold">{profile.completedTickets}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-50">
            <p className="text-lg font-bold">{profile.loyaltyTier || 'Bronze'}</p>
            <p className="text-xs text-muted-foreground">Tier</p>
          </div>
          {profile.avgServiceTime && (
            <div className="col-span-3 text-center p-2 rounded-lg bg-slate-50">
              <p className="text-sm">Avg Service: <span className="font-semibold">{Math.floor(profile.avgServiceTime / 60)}m {profile.avgServiceTime % 60}s</span></p>
            </div>
          )}
          {profile.lastVisitAt && (
            <p className="col-span-3 text-xs text-muted-foreground text-center">Last visit: {new Date(profile.lastVisitAt).toLocaleDateString()}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">No visit history found</p>
      )}
    </div>
  );
}

function StepMyTickets({
  tickets,
  loading,
  onBack,
  onSelectTicket,
  customerPhone,
  tenantId,
}: {
  tickets: Ticket[];
  loading: boolean;
  onBack: () => void;
  onSelectTicket: (ticket: Ticket) => void;
  customerPhone?: string;
  tenantId?: string;
}) {
  // Group by status for better UX
  const active = tickets.filter((t) => t.status === 'WAITING' || t.status === 'SERVING');
  const past = tickets.filter((t) => t.status !== 'WAITING' && t.status !== 'SERVING');

  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">My Tickets</h2>
        <p className="text-sm text-muted-foreground mt-1">
          All your tickets at this location
        </p>
      </div>

      {/* Customer History */}
      {customerPhone && tenantId && (
        <CustomerHistoryPanel phone={customerPhone} tenantId={tenantId} />
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl">
          <Wallet className="size-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No tickets found for this phone number</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {active.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Active ({active.length})
              </p>
              {active.map((t, i) => (
                <motion.button
                  key={t.id}
                  custom={i}
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  whileTap={{ scale: 0.97 }}
                  className="w-full text-left"
                  onClick={() => onSelectTicket(t)}
                >
                  <Card className="py-3.5 px-4 border-l-4 border-l-emerald-500 cursor-pointer hover:shadow-md transition-all">
                    <CardContent className="p-0 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col items-center">
                          <p className="text-lg font-bold text-foreground leading-tight">
                            {t._formattedSerial || `${t.queue?.prefix ?? '?'}-${String(t.serialNumber).padStart(3, '0')}`}
                          </p>
                          <p className="text-xs text-muted-foreground">{t.queue?.name}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <StatusBadge status={t.status} />
                        {t.status === 'WAITING' && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="size-3" />
                            <span>{t._peopleAhead ?? 0} ahead</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.button>
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Past ({past.length})
              </p>
              {past.map((t, i) => (
                <motion.button
                  key={t.id}
                  custom={i}
                  variants={fadeInUp}
                  initial="hidden"
                  animate="visible"
                  whileTap={{ scale: 0.97 }}
                  className="w-full text-left opacity-70"
                  onClick={() => onSelectTicket(t)}
                >
                  <Card className="py-3 px-4 cursor-pointer hover:shadow-sm transition-all">
                    <CardContent className="p-0 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {t._formattedSerial || `${t.queue?.prefix ?? '?'}-${String(t.serialNumber).padStart(3, '0')}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{t.queue?.name}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </CardContent>
                  </Card>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      <Button variant="ghost" className="h-11 w-full" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Back to Ticket
      </Button>
    </div>
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
    activeTicket,
    setActiveTicket,
    myTickets,
    setMyTickets,
    setCurrentView,
  } = useAppStore();

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
  const [isPolling, setIsPolling] = useState(false);
  const prevStatusRef = useRef<TicketStatus | null>(null);

  // Polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(activeTicket);

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
    async (queueId: string, name: string, phone: string | undefined) => {
      if (!joinTenantId) return;
      setJoining(true);
      try {
        const res = await fetch('/api/queues/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: joinTenantId,
            queueId,
            customerName: name,
            customerPhone: phone,
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
        const prevStatus = prevStatusRef.current;
        setTicket(updated);
        setActiveTicket(updated);
        // Only show toast on status change
        if (prevStatus && prevStatus !== updated.status) {
          if (updated.status === 'SERVING') {
            toast.success('Your turn has come! Please proceed to the counter.');
          } else if (updated.status === 'COMPLETED') {
            toast.success('Your service has been completed!');
          } else if (updated.status === 'SKIPPED') {
            toast.error('Your ticket was skipped. Please contact staff.');
          } else if (updated.status === 'CANCELLED') {
            toast.error('Your ticket has been cancelled.');
          }
        }
        prevStatusRef.current = updated.status;
      }
    } catch {
      toast.error('Failed to update ticket status');
    } finally {
      setTracking(false);
    }
  }, [ticket, setActiveTicket]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    prevStatusRef.current = ticket?.status ?? null;
    setIsPolling(true);
    // Immediately fetch once
    handleTrack();
    // Then poll every 10s
    pollRef.current = setInterval(() => {
      handleTrack();
    }, 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [handleTrack, ticket?.status]);

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

  const handleBackToHome = useCallback(() => {
    stopPolling();
    setJoinTenantId(null);
    setTenantWithQueues(null);
    setQueues([]);
    setTicket(null);
    setActiveTicket(null);
    setCurrentView('marketing');
  }, [setJoinTenantId, setActiveTicket, setCurrentView, stopPolling]);

  const handleNewTicket = useCallback(() => {
    stopPolling();
    setTicket(null);
    setActiveTicket(null);
    goTo('queue', -1);
  }, [setActiveTicket, goTo, stopPolling]);

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
      stopPolling();
      setTicket(null);
      setActiveTicket(null);
      goTo('queue', -1);
    } catch {
      toast.error('Failed to leave the queue');
    }
  }, [ticket, setActiveTicket, goTo, stopPolling]);

  const handleHome = useCallback(() => {
    stopPolling();
    setJoinTenantId(null);
    setTenantWithQueues(null);
    setQueues([]);
    setTicket(null);
    setActiveTicket(null);
    setCurrentView('marketing');
  }, [setJoinTenantId, setActiveTicket, setCurrentView, stopPolling]);

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

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Stop polling when ticket reaches a terminal or serving state
  useEffect(() => {
    if (ticket && (ticket.status === 'SERVING' || ticket.status === 'COMPLETED' || ticket.status === 'SKIPPED' || ticket.status === 'CANCELLED')) {
      stopPolling();
    }
  }, [ticket?.status, stopPolling]);

  // Auto-start polling when on confirmation step and ticket is WAITING
  useEffect(() => {
    if (step === 'confirmation' && ticket && (ticket.status === 'WAITING' || ticket.status === 'SERVING')) {
      const cleanup = startPolling();
      return cleanup;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      setIsPolling(false);
    };
  }, [step, ticket, startPolling]);

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
            className="min-h-[44px] min-w-[44px] px-2"
            onClick={() => {
              if (step === 'queue') handleBackToHome();
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
              <StepSelectQueue
                tenant={tenantWithQueues}
                queues={queues}
                loading={loadingTenantDetail}
                joining={joining}
                onJoin={handleJoin}
                onBack={handleBackToHome}
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
              <StepTicketConfirmation
                ticket={ticket}
                tracking={tracking}
                isPolling={isPolling}
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
              <StepMyTickets
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