import type { TicketStatus, BrandingConfig } from '@/lib/types';
import {
  Clock, CircleDot, CheckCircle2, XCircle, MinusCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatEwt(seconds: number): string {
  if (seconds <= 0) return 'Less than a minute';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

export const STATUS_STYLES: Record<TicketStatus, { label: string; className: string; icon: React.ElementType }> = {
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

export function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_STYLES[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 text-xs font-semibold ${cfg.className}`}>
      <Icon className="size-3.5" />
      {cfg.label}
    </Badge>
  );
}

export function parseBranding(raw: string | null): BrandingConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BrandingConfig;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

export const pageVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

export const pageTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

export const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35 },
  }),
};