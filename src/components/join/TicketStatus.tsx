'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Clock, ArrowLeft, Loader2,
  Wallet, RefreshCw, Hash, AlertTriangle,
  LogOut, Star, History, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
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
import type { Ticket } from '@/lib/types';
import { toast } from 'sonner';
import { QRCodeDisplay } from '@/components/QRCode';
import { formatEwt, fadeInUp, parseBranding, STATUS_STYLES, StatusBadge } from './join-helpers';

// ---------------------------------------------------------------------------
// Feedback Form Component
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Customer History Panel Component
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Step Ticket Confirmation (Active ticket display with polling)
// ---------------------------------------------------------------------------
export function TicketStatusView({
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
// Step My Tickets (Queue Wallet)
// ---------------------------------------------------------------------------
export function MyTicketsView({
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