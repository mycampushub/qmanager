import { Badge } from '@/components/ui/badge';

// ─── TYPES ──────────────────────────────────────────────────
export interface BranchData {
  id: string;
  name: string;
  planTier: string;
  walletBalance: number;
  isActive: boolean;
  queueCount: number;
  staffCount: number;
  createdAt: string;
}

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  branchName: string;
  isActive: boolean;
}

export type MTTab = 'branches' | 'analytics' | 'staff';

export type PlanTier = 'FREE' | 'PRO' | 'ENTERPRISE';

// ─── AUTH HEADERS HELPER ────────────────────────────────────
export function mtHeaders(token: string | null, json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// ─── PLAN TIER BADGE ────────────────────────────────────────
export function PlanTierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    FREE: 'bg-slate-100 text-slate-700',
    PRO: 'bg-emerald-100 text-emerald-700',
    ENTERPRISE: 'bg-amber-100 text-amber-700',
  };
  return (
    <Badge className={styles[tier] || 'bg-slate-100 text-slate-700'}>{tier}</Badge>
  );
}