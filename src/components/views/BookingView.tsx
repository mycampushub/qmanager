'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, Clock, Loader2, CheckCircle2,
  ArrowLeft, XCircle, QrCode, Download, Globe,
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
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { BrandingConfig } from '@/lib/types';
import { formatEwt, STATUS_STYLES } from '@/components/join/join-helpers';

// ─── Types ──────────────────────────────────────────────────────
interface QueueOption {
  id: string;
  name: string;
  prefix: string;
}

interface BookingResult {
  ticket: {
    id: string;
    tenantId: string;
    queueId: string;
    serialNumber: number;
    status: string;
    customerName: string;
    customerPhone: string | null;
    source: string;
    _formattedSerial: string;
    _peopleAhead: number;
    _ewt: number;
    _estimatedServiceTime: string;
    _serviceOpensAt: string;
  };
  appointment: {
    id: string;
    scheduledDate: string;
    status: string;
    source: string;
    bookingOrder: number;
  };
  queueName: string;
  tenantName: string;
  branding: BrandingConfig;
  trackingUrl: string;
}

type Step = 'form' | 'success';

// ─── Available Dates Helper ─────────────────────────────────────
function getAvailableDates(maxDays: number = 7): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Main Component ─────────────────────────────────────────────
export default function BookingView({
  tenantId,
  onHome,
}: {
  tenantId: string;
  onHome: () => void;
}) {
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Tenant data
  const [tenantName, setTenantName] = useState('');
  const [branding, setBranding] = useState<BrandingConfig>({
    primaryColor: '#10b981',
    secondaryColor: '#059669',
    logoText: '',
    welcomeMessage: '',
  });
  const [queues, setQueues] = useState<QueueOption[]>([]);

  // Form
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedQueue, setSelectedQueue] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Result
  const [result, setResult] = useState<BookingResult | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const primaryColor = branding.primaryColor || '#10b981';

  // ── Fetch tenant data ──
  const fetchTenant = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/display`);
      if (!res.ok) {
        toast.error('Failed to load booking information');
        return;
      }
      const data = await res.json();
      const t = data.tenant;
      setTenantName(t.name || '');
      if (t._queues) {
        setQueues(
          t._queues
            .filter((q: { isActive: boolean }) => q.isActive)
            .map((q: { id: string; name: string; prefix: string }) => ({
              id: q.id,
              name: q.name,
              prefix: q.prefix,
            }))
        );
      }
      if (t.brandingConfig) {
        try {
          const bc = typeof t.brandingConfig === 'string' ? JSON.parse(t.brandingConfig) : t.brandingConfig;
          setBranding((prev) => ({ ...prev, ...bc, logoText: t.name }));
        } catch { /* use default */ }
      } else {
        setBranding((prev) => ({ ...prev, logoText: t.name }));
      }
    } catch {
      toast.error('Failed to load booking information');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  // Auto-set first available date
  useEffect(() => {
    if (!loading && !selectedDate) {
      const dates = getAvailableDates();
      if (dates.length > 0) setSelectedDate(dates[0]);
    }
  }, [loading, selectedDate]);

  // Auto-select queue if only one
  useEffect(() => {
    if (queues.length === 1 && !selectedQueue) {
      setSelectedQueue(queues[0].id);
    }
  }, [queues, selectedQueue]);

  // ── Submit booking ──
  const handleBook = async () => {
    if (!customerName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!selectedQueue) {
      toast.error('Please select a service');
      return;
    }
    if (!selectedDate) {
      toast.error('Please select a date');
      return;
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try { headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }

      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId,
          queueId: selectedQueue,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          scheduledDate: selectedDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'DUPLICATE_TICKET' && data.existingTicketId) {
          toast.info(data.error);
          // Redirect to ticket tracking
          window.location.href = `?ticket=${data.existingTicketId}`;
          return;
        }
        if (data.code === 'DUPLICATE_BOOKING') {
          toast.info(data.error);
          return;
        }
        throw new Error(data.error || 'Booking failed');
      }

      setResult(data);
      setStep('success');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Cancel booking ──
  const handleCancel = async () => {
    if (!result) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/appointments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: result.ticket.id,
          tenantId: result.ticket.tenantId,
          customerPhone: result.ticket.customerPhone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel');
      }
      toast.success('Booking cancelled successfully');
      setShowCancelDialog(false);
      setResult(null);
      setStep('form');
      setCustomerName('');
      setCustomerPhone('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  // ── Download PDF ──
  const handleDownloadPdf = async () => {
    if (!result) return;
    try {
      const { downloadTicketPdf } = await import('@/lib/download-ticket-pdf');
      await downloadTicketPdf({
        ticket: {
          id: result.ticket.id,
          tenantId: result.ticket.tenantId,
          queueId: result.ticket.queueId,
          serialNumber: result.ticket.serialNumber,
          status: 'WAITING',
          customerName: result.ticket.customerName,
          customerPhone: result.ticket.customerPhone,
          deviceId: null,
          notes: null,
          source: 'ONLINE_BOOKING',
          createdAt: new Date().toISOString(),
          servedAt: null,
          completedAt: null,
          cancelledAt: null,
          skippedAt: null,
          servedByAgent: null,
          skipCount: 0,
          _formattedSerial: result.ticket._formattedSerial,
          _peopleAhead: result.ticket._peopleAhead,
          _ewt: result.ticket._ewt,
          _estimatedServiceTime: result.ticket._estimatedServiceTime,
          _serviceOpensAt: result.ticket._serviceOpensAt,
          queue: { name: result.queueName, prefix: '', } as any,
          tenant: { name: result.tenantName, brandingConfig: JSON.stringify(result.branding) } as any,
        },
        peopleAhead: result.ticket._peopleAhead - 1,
        ewtSeconds: result.ticket._ewt,
      });
    } catch {
      toast.error('Failed to generate ticket PDF');
    }
  };

  const availableDates = getAvailableDates();
  const todayStr = new Intl.DateTimeFormat('en-CA').format(new Date());

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-border/50">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
            <button
              onClick={onHome}
              className="flex items-center gap-1.5 text-sm font-bold hover:text-emerald-800 transition-colors min-h-[44px] min-w-[44px] justify-center"
              style={{ color: primaryColor }}
              aria-label="Go to home"
            >
              <QrCode className="size-5" />
              <span className="hidden sm:inline">QueueFlow</span>
            </button>
            <div className="w-[44px]" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={step === 'form' ? onHome : () => { setStep('form'); setResult(null); }}
            className="flex items-center gap-1.5 text-sm font-bold hover:text-emerald-800 transition-colors min-h-[44px] min-w-[44px] justify-center"
            style={{ color: primaryColor }}
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
            {step === 'success' && <span>Back</span>}
          </button>
          <span className="text-sm font-medium text-muted-foreground truncate max-w-[200px]">
            {tenantName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
              const next = current === 'en' ? 'bn' : 'en';
              // Simple toggle for locale display (no full i18n in widget)
            }}
            className="h-8 w-8 p-0 text-muted-foreground"
            aria-label="Language"
          >
            <Globe className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Title */}
              <div className="text-center space-y-2">
                <div
                  className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-2"
                  style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                >
                  <CalendarDays className="size-8" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">Book Your Spot</h1>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {branding.welcomeMessage || 'Secure your queue position in advance. No need to wait in line.'}
                </p>
              </div>

              {/* Service Selection */}
              {queues.length > 1 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Select Service *</Label>
                  <Select value={selectedQueue} onValueChange={setSelectedQueue}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Choose a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {queues.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.prefix} — {q.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Date Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Select Date *</Label>
                <div className="grid grid-cols-4 gap-2">
                  {availableDates.map((d) => {
                    const isToday = d === todayStr;
                    const isSelected = d === selectedDate;
                    return (
                      <button
                        key={d}
                        onClick={() => setSelectedDate(d)}
                        className={`h-14 rounded-xl border-2 text-center transition-all min-h-[44px] ${
                          isSelected
                            ? 'text-white shadow-md'
                            : 'border-border hover:border-gray-300 bg-white'
                        }`}
                        style={
                          isSelected
                            ? { borderColor: primaryColor, backgroundColor: primaryColor }
                            : undefined
                        }
                      >
                        <div className="text-[11px] font-medium leading-tight">
                          {isToday ? 'Today' : formatDateLabel(d).split(', ')[0]}
                        </div>
                        <div className="text-sm font-bold leading-tight">
                          {new Date(d + 'T12:00:00').getDate()}
                        </div>
                        <div className="text-[10px] leading-tight opacity-70">
                          {isToday ? '' : formatDateLabel(d).split(', ')[1] || ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="booking-name" className="text-sm font-medium">Your Name *</Label>
                <Input
                  id="booking-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter your full name"
                  className="h-12"
                  maxLength={200}
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="booking-phone" className="text-sm font-medium">
                  Phone Number
                  <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                </Label>
                <Input
                  id="booking-phone"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+880..."
                  className="h-12"
                />
                <p className="text-xs text-muted-foreground">
                  Used for duplicate booking prevention and ticket recovery
                </p>
              </div>

              {/* Submit */}
              <Button
                className="w-full h-12 text-base font-semibold text-white"
                style={{ backgroundColor: primaryColor }}
                disabled={submitting || !customerName.trim() || !selectedQueue || !selectedDate}
                onClick={handleBook}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Booking...
                  </>
                ) : (
                  'Book Your Spot'
                )}
              </Button>
            </motion.div>
          )}

          {step === 'success' && result && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              {/* Success indicator */}
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mb-2">
                  <CheckCircle2 className="size-8 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Booking Confirmed!</h2>
                <p className="text-sm text-muted-foreground">
                  Your queue position has been secured for {formatDateLabel(result.appointment.scheduledDate)}
                </p>
              </div>

              {/* Ticket Card */}
              <Card className="border-2 overflow-hidden">
                {/* Colored banner */}
                <div
                  className="px-5 py-3 text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs opacity-80">{result.tenantName}</p>
                      <p className="text-sm font-semibold">{result.queueName}</p>
                    </div>
                    <Badge className="bg-white/20 text-white border-0 text-xs">
                      Online Booking
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-5 space-y-4">
                  {/* Serial Number */}
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Your Ticket Number
                    </p>
                    <p
                      className="text-5xl font-black tracking-tight"
                      style={{ color: primaryColor }}
                    >
                      {result.ticket._formattedSerial}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-xl bg-muted/50">
                      <p className="text-lg font-bold text-foreground">
                        {result.ticket._peopleAhead}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Position</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-muted/50">
                      <p className="text-lg font-bold text-foreground">
                        {result.ticket._peopleAhead - 1}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Ahead of You</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-muted/50">
                      <p className="text-lg font-bold text-foreground">
                        {formatEwt(result.ticket._ewt)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Est. Wait</p>
                    </div>
                  </div>

                  {/* Estimated Service Time */}
                  {result.ticket._estimatedServiceTime && (
                    <div
                      className="flex items-center gap-3 p-3 rounded-xl border"
                      style={{ borderColor: `${primaryColor}30`, backgroundColor: `${primaryColor}08` }}
                    >
                      <Clock className="w-5 h-5 shrink-0" style={{ color: primaryColor }} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Est. Service Time
                        </p>
                        <p className="text-lg font-bold" style={{ color: primaryColor }}>
                          {result.ticket._estimatedServiceTime}
                        </p>
                        {result.ticket._serviceOpensAt && (
                          <p className="text-xs text-muted-foreground">
                            Service opens at {result.ticket._serviceOpensAt}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Customer Info */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium">{result.ticket.customerName}</span>
                    </div>
                    {result.ticket.customerPhone && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Phone</span>
                        <span className="font-medium">{result.ticket.customerPhone}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium">{formatDateLabel(result.appointment.scheduledDate)}</span>
                    </div>
                  </div>

                  {/* Tracking URL */}
                  <div className="p-3 rounded-xl bg-muted/50 text-center space-y-1">
                    <p className="text-xs text-muted-foreground">Track your live position</p>
                    <p className="text-sm font-mono text-xs break-all" style={{ color: primaryColor }}>
                      {typeof window !== 'undefined'
                        ? `${window.location.origin}${window.location.pathname}${result.trackingUrl}`
                        : result.trackingUrl
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  className="w-full h-12 text-base font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                  onClick={handleDownloadPdf}
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download Ticket
                </Button>

                {result.ticket.status === 'WAITING' && (
                  <Button
                    variant="outline"
                    className="w-full h-12 text-base font-semibold text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    <XCircle className="w-5 h-5 mr-2" />
                    Cancel Booking
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your booking for ticket{' '}
              <strong>{result?.ticket._formattedSerial}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {cancelling ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Yes, Cancel Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-border/40 mt-auto">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="font-semibold" style={{ color: primaryColor }}>QueueFlow</span>
        </p>
      </footer>
    </div>
  );
}