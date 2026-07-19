// ─── SHARED TYPES & HELPERS FOR PLATFORM ADMIN TABS ──────

export interface AdminAnalytics {
  totalTenants: number;
  activeToday: number;
  totalTicketsServed: number;
  totalRevenue: number;
}

export type BlockLevel = 'NONE' | 'SOFT' | 'HARD';

export interface TenantRow {
  id: string;
  name: string;
  planTier: string;
  walletBalance: number;
  todayTicketCount: number;
  staffCount: number;
  isActive: boolean;
  blockLevel: BlockLevel;
  blockReason: string | null;
  masterTenantId: string | null;
  masterTenant?: { id: string; corporateName: string } | null;
  createdAt?: string;
}

export interface SubTenantRow {
  id: string;
  name: string;
  planTier: string;
  walletBalance: number;
  isActive: boolean;
  createdAt: string;
}

export interface MasterTenantRow {
  id: string;
  corporateName: string;
  billingStatus: string;
  isActive: boolean;
  subTenants: SubTenantRow[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRow {
  id: string;
  userId: string;
  userType: string;
  action: string;
  details: string;
  ipAddress: string;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export type AdminTab = 'overview' | 'tenants' | 'masterTenants' | 'auditLog';

// ─── AUTH HEADERS HELPER ────────────────────────────────
export function adminHeaders(token: string | null, json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}