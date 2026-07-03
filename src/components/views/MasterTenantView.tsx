'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, BarChart3, LogOut, Menu, Loader2, Crown,
  ChevronLeft, Plus, Pencil, Check, X, ListOrdered, UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { MasterTenantAdminUser } from '@/stores/app-store';

// ─── TYPES ──────────────────────────────────────────────────
interface BranchData {
  id: string;
  name: string;
  planTier: string;
  walletBalance: number;
  isActive: boolean;
  queueCount: number;
  staffCount: number;
  createdAt: string;
}

interface BranchAnalytics {
  branchName: string;
  queueCount: number;
  staffCount: number;
}

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  branchName: string;
  isActive: boolean;
}

type MTTab = 'branches' | 'analytics' | 'staff';

type PlanTier = 'FREE' | 'PRO' | 'ENTERPRISE';

// ─── AUTH HEADERS HELPER ────────────────────────────────────
function mtHeaders(token: string | null, json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// ─── LOGIN SCREEN ───────────────────────────────────────────
function MTLoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setMtAuth, setCurrentView } = useAppStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/master-tenant/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login failed');
        return;
      }
      if (data.user?.type !== 'master_tenant_admin' && data.user?.role !== 'MASTER_TENANT_ADMIN') {
        toast.error('Access denied. Master tenant admin credentials required.');
        return;
      }
      setMtAuth(
        {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name || data.user.email,
          masterTenantId: data.user.masterTenantId,
          masterTenant: data.user.masterTenant,
        },
        data.token,
      );
      toast.success(`Welcome, ${data.user.name || data.user.email}!`);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50/30 p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white mb-4">
            <Crown className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Franchise HQ</h1>
          <p className="text-muted-foreground mt-2">Multi-branch management dashboard</p>
        </div>
        <Card className="shadow-lg border-slate-200">
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mt-email">Email</Label>
                <Input
                  id="mt-email"
                  type="email"
                  placeholder="hq@cityhealthgroup.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mt-password">Password</Label>
                <Input
                  id="mt-password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Sign In
              </Button>
            </form>
            <div className="mt-4">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setCurrentView('marketing')}>
                <ChevronLeft className="w-3 h-3 mr-1" /> Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">Demo: hq@cityhealthgroup.com / manager123</p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── PLAN TIER BADGE ────────────────────────────────────────
function PlanTierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    FREE: 'bg-slate-100 text-slate-700',
    PRO: 'bg-emerald-100 text-emerald-700',
    ENTERPRISE: 'bg-amber-100 text-amber-700',
  };
  return (
    <Badge className={styles[tier] || 'bg-slate-100 text-slate-700'}>{tier}</Badge>
  );
}

// ─── ADD BRANCH DIALOG ──────────────────────────────────────
function AddBranchDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const mtToken = useAppStore((s) => s.mtToken);
  const [name, setName] = useState('');
  const [planTier, setPlanTier] = useState<PlanTier>('PRO');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setName('');
    setPlanTier('PRO');
    setManagerEmail('');
    setManagerName('');
    setManagerPassword('');
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Branch name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/master-tenant/branches', {
        method: 'POST',
        headers: mtHeaders(mtToken),
        body: JSON.stringify({
          name: name.trim(),
          planTier,
          managerEmail: managerEmail.trim() || undefined,
          managerName: managerName.trim() || undefined,
          managerPassword: managerPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create branch');
        return;
      }
      toast.success(`Branch "${name.trim()}" created successfully!`);
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const tierOptions: { value: PlanTier; label: string; desc: string }[] = [
    { value: 'FREE', label: 'Free', desc: 'Basic features' },
    { value: 'PRO', label: 'Pro', desc: 'Advanced features' },
    { value: 'ENTERPRISE', label: 'Enterprise', desc: 'Full access' },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Branch</DialogTitle>
          <DialogDescription>Create a new branch under your franchise group. A default queue will be created automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Branch Name */}
          <div className="space-y-2">
            <Label htmlFor="branch-name">Branch Name <span className="text-red-500">*</span></Label>
            <Input
              id="branch-name"
              placeholder="e.g. CityHealth Midtown Clinic"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Plan Tier */}
          <div className="space-y-2">
            <Label>Plan Tier</Label>
            <div className="grid grid-cols-3 gap-2">
              {tierOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlanTier(opt.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-sm transition-all ${
                    planTier === opt.value
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700 font-medium'
                      : 'border-slate-200 text-muted-foreground hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-xs">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Manager Details - Optional */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Branch Manager <span className="text-muted-foreground font-normal">(optional)</span></Label>
            </div>
            <div className="space-y-2 pl-6">
              <div className="space-y-1.5">
                <Label htmlFor="mgr-email" className="text-xs text-muted-foreground">Manager Email</Label>
                <Input
                  id="mgr-email"
                  type="email"
                  placeholder="manager@branch.com"
                  value={managerEmail}
                  onChange={(e) => setManagerEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-name" className="text-xs text-muted-foreground">Manager Name</Label>
                <Input
                  id="mgr-name"
                  placeholder="John Doe"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mgr-pw" className="text-xs text-muted-foreground">Manager Password</Label>
                <Input
                  id="mgr-pw"
                  type="password"
                  placeholder="Min 8 chars, 1 uppercase, 1 digit"
                  value={managerPassword}
                  onChange={(e) => setManagerPassword(e.target.value)}
                />
                {managerPassword && (
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters with 1 uppercase letter and 1 digit.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BRANCH CARD ────────────────────────────────────────────
function BranchCard({
  branch,
  onToggleActive,
  onEditName,
  actionLoading,
}: {
  branch: BranchData;
  onToggleActive: (b: BranchData) => void;
  onEditName: (b: BranchData) => void;
  actionLoading: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(branch.name);

  useEffect(() => {
    setEditName(branch.name);
    setEditing(false);
  }, [branch.name]);

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== branch.name) {
      onEditName({ ...branch, name: editName.trim() });
    } else {
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveName();
    if (e.key === 'Escape') {
      setEditName(branch.name);
      setEditing(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-7 text-sm"
                    autoFocus
                    disabled={actionLoading}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveName} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setEditName(branch.name); setEditing(false); }}>
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <CardTitle className="text-base truncate">{branch.name}</CardTitle>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <PlanTierBadge tier={branch.planTier} />
            <Badge className={branch.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
              {branch.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            <div>
              <p className="text-2xl font-bold">{branch.queueCount}</p>
              <p className="text-xs text-muted-foreground">Queues</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{branch.staffCount}</p>
              <p className="text-xs text-muted-foreground">Staff</p>
            </div>
            <div>
              <p className="text-2xl font-bold">${(branch.walletBalance / 100).toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">Wallet</p>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={() => setEditing(true)}
              disabled={actionLoading}
            >
              <Pencil className="w-3 h-3 mr-1" /> Edit Name
            </Button>
            <Button
              variant={branch.isActive ? 'outline' : 'default'}
              size="sm"
              className={`flex-1 text-xs h-8 ${branch.isActive ? 'text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              onClick={() => onToggleActive(branch)}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <ListOrdered className="w-3 h-3 mr-1" />
              )}
              {branch.isActive ? 'Deactivate' : 'Activate'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── BRANCHES TAB ───────────────────────────────────────────
function BranchesTab() {
  const mtToken = useAppStore((s) => s.mtToken);
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/master-tenant/branches', {
        headers: { Authorization: `Bearer ${mtToken}` },
      });
      const data = await res.json();
      if (data.branches) {
        setBranches(data.branches);
      }
    } catch {
      // Fallback to empty state
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }, [mtToken]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  const handleToggleActive = async (branch: BranchData) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/master-tenant/branches', {
        method: 'PUT',
        headers: mtHeaders(mtToken),
        body: JSON.stringify({ branchId: branch.id, isActive: !branch.isActive }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update branch');
        return;
      }
      toast.success(`${branch.name} is now ${!branch.isActive ? 'active' : 'inactive'}`);
      fetchBranches();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditName = async (branch: BranchData) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/master-tenant/branches', {
        method: 'PUT',
        headers: mtHeaders(mtToken),
        body: JSON.stringify({ branchId: branch.id, name: branch.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to update branch name');
        return;
      }
      toast.success(`Branch renamed to "${branch.name}"`);
      fetchBranches();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Branches</h2>
          <p className="text-sm text-muted-foreground">{branches.length} branch{branches.length !== 1 ? 'es' : ''} in your group</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Branch
        </Button>
      </div>

      {branches.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground">No branches yet</h3>
            <p className="text-xs text-muted-foreground mt-1">Add your first branch to get started.</p>
            <Button className="mt-4 bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Branch
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              onToggleActive={handleToggleActive}
              onEditName={handleEditName}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      <AddBranchDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={fetchBranches}
      />
    </div>
  );
}

// ─── CROSS-BRANCH ANALYTICS TAB ─────────────────────────────
function CrossBranchAnalyticsTab() {
  const mtToken = useAppStore((s) => s.mtToken);
  const [analytics, setAnalytics] = useState<BranchAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/master-tenant/branches', {
        headers: { Authorization: `Bearer ${mtToken}` },
      });
      const data = await res.json();
      if (data.branches) {
        const branchAnalytics: BranchAnalytics[] = data.branches.map((b: BranchData) => ({
          branchName: b.name,
          queueCount: b.queueCount,
          staffCount: b.staffCount,
        }));
        setAnalytics(branchAnalytics);
      }
    } catch {
      // Fallback to empty
      setAnalytics([]);
    } finally {
      setLoading(false);
    }
  }, [mtToken]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Summary stats
  const totalQueues = analytics.reduce((s, a) => s + a.queueCount, 0);
  const totalStaff = analytics.reduce((s, a) => s + a.staffCount, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cross-Branch Analytics</h2>
        <p className="text-sm text-muted-foreground">Overview across all {analytics.length} branch{analytics.length !== 1 ? 'es' : ''}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Branches</p>
            <p className="text-2xl font-bold">{analytics.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total Queues</p>
            <p className="text-2xl font-bold">{totalQueues}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total Staff</p>
            <p className="text-2xl font-bold">{totalStaff}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Avg Staff/Branch</p>
            <p className="text-2xl font-bold">{analytics.length > 0 ? (totalStaff / analytics.length).toFixed(1) : '0'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Branch Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Queues</TableHead>
                  <TableHead className="text-center hidden sm:table-cell">Staff</TableHead>
                  <TableHead className="text-center sm:hidden">Q / S</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No branch data available
                    </TableCell>
                  </TableRow>
                ) : (
                  analytics.map((a) => (
                    <TableRow key={a.branchName}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="font-medium">{a.branchName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">{a.queueCount}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">{a.staffCount}</TableCell>
                      <TableCell className="text-center sm:hidden">
                        <span className="text-sm">{a.queueCount} / {a.staffCount}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── STAFF TAB ──────────────────────────────────────────────
function StaffTab() {
  const mtToken = useAppStore((s) => s.mtToken);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/master-tenant/branches', {
        headers: { Authorization: `Bearer ${mtToken}` },
      });
      const data = await res.json();
      if (data.branches) {
        // Derive staff counts per branch from the branch data
        // Since the branch API returns staffCount, we show per-branch summary
        const staffList: StaffRow[] = [];
        for (const b of data.branches) {
          // Show a placeholder manager row for each branch (real staff data per branch
          // requires individual branch login)
          staffList.push({
            id: `${b.id}-mgr`,
            name: `${b.name} Manager`,
            email: '(set at creation)',
            role: 'MANAGER',
            branchName: b.name,
            isActive: b.isActive,
          });
          // Add placeholder agent rows based on staffCount - 1 (for manager)
          const agentCount = Math.max(0, (b.staffCount ?? 0) - 1);
          for (let i = 1; i <= agentCount; i++) {
            staffList.push({
              id: `${b.id}-a${i}`,
              name: `Agent ${i}`,
              email: '(branch staff)',
              role: 'AGENT',
              branchName: b.name,
              isActive: b.isActive,
            });
          }
        }
        setStaff(staffList);
      }
    } catch {
      // Fallback to empty
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [mtToken]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Staff Across All Branches</h2>
        <p className="text-xs text-muted-foreground">
          Staff data shown per branch is derived from branch records. Full staff management is available in each branch&apos;s own dashboard.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No staff found
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
                              {s.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{s.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{s.email}</TableCell>
                      <TableCell className="text-sm">{s.branchName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">{s.role}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge className={s.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                          {s.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── MT SIDEBAR ─────────────────────────────────────────────
function MTSidebar({
  navItems,
  mtTab,
  setMTTab,
  userName,
  corporateName,
  logout,
}: {
  navItems: Array<{ id: MTTab; label: string; icon: typeof Building2 }>;
  mtTab: MTTab;
  setMTTab: (tab: MTTab) => void;
  userName: string;
  corporateName: string;
  logout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">QueueFlow</p>
            <p className="text-xs text-muted-foreground truncate">{corporateName}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Franchise navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setMTTab(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              mtTab === item.id
                ? 'bg-emerald-50 text-emerald-700 font-medium'
                : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t space-y-2">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
              {userName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">HQ Admin</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
}

// ─── MAIN MASTER TENANT VIEW ────────────────────────────────
export default function MasterTenantView() {
  const { mtUser, mtToken, mtLogout, setCurrentView } = useAppStore();
  const [mtTab, setMTTab] = useState<MTTab>('branches');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Restore MT auth from localStorage on mount
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('qms_mt_token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('qms_mt_user') : null;
    if (token && userStr && !mtUser) {
      try {
        const user = JSON.parse(userStr) as MasterTenantAdminUser;
        useAppStore.getState().setMtAuth(user, token);
      } catch { /* invalid stored data */ }
    }
  }, [mtUser]);

  if (!mtUser) {
    return <MTLoginScreen />;
  }

  const navItems: Array<{ id: MTTab; label: string; icon: typeof Building2 }> = [
    { id: 'branches', label: 'Branches', icon: Building2 },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'staff', label: 'Staff', icon: Users },
  ];

  const corporateName = mtUser.masterTenant?.corporateName || 'Franchise HQ';

  return (
    <div className="h-screen flex flex-row overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-white shrink-0 h-full">
        <MTSidebar
          navItems={navItems}
          mtTab={mtTab}
          setMTTab={(t) => { setMTTab(t); setSidebarOpen(false); }}
          userName={mtUser.name}
          corporateName={corporateName}
          logout={mtLogout}
        />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 shadow-xl md:hidden"
            >
              <MTSidebar
                navItems={navItems}
                mtTab={mtTab}
                setMTTab={(t) => { setMTTab(t); setSidebarOpen(false); }}
                userName={mtUser.name}
                corporateName={corporateName}
                logout={mtLogout}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-white flex items-center px-4 gap-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{corporateName}</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">{mtUser.email}</p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700">HQ</Badge>
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
              {mtUser.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={mtTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {mtTab === 'branches' && <BranchesTab />}
              {mtTab === 'analytics' && <CrossBranchAnalyticsTab />}
              {mtTab === 'staff' && <StaffTab />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden border-t bg-white flex shrink-0 safe-area-bottom" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setMTTab(item.id)}
              className={`flex-1 flex flex-col items-center py-2.5 text-xs transition-colors ${
                mtTab === item.id ? 'text-emerald-600' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="mt-0.5">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}