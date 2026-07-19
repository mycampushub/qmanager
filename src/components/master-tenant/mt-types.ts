// ─── Master Tenant Types ─────────────────────────────────────

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