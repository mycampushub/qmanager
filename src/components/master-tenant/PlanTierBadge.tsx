import { Badge } from '@/components/ui/badge';

/** Plan tier color-coded badge component */
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