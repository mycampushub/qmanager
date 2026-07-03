'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Building2, Users, BarChart3, FileText, Plus, Search,
  Loader2, LogOut, Menu, X, ChevronLeft, Eye, Crown,
  Pencil, Trash2, ShieldCheck, ShieldX, Wallet, RefreshCw, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

// ─── TYPES ──────────────────────────────────────────────────
interface AdminAnalytics {
  totalTenants: number;
  activeToday: number;
  totalTicketsServed: number;
  totalRevenue: number;
}

interface TenantRow {
  id: string;
  name: string;
  planTier: string;
  walletBalance: number;
  todayTicketCount: number;
  staffCount: number;
  isActive: boolean;
  masterTenantId: string | null;
  masterTenant?: { id: string; corporateName: string } | null;
  createdAt?: string;
}

interface SubTenantRow {
  id: string;
  name: string;
  planTier: string;
  walletBalance: number;
  isActive: boolean;
  createdAt: string;
}

interface MasterTenantRow {
  id: string;
  corporateName: string;
  billingStatus: string;
  isActive: boolean;
  subTenants: SubTenantRow[];
  createdAt: string;
  updatedAt: string;
}

interface AuditLogRow {
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

type AdminTab = 'overview' | 'tenants' | 'masterTenants' | 'auditLog';

// ─── AUTH HEADERS HELPER ────────────────────────────────────
function adminHeaders(token: string | null, json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

// ─── LOGIN SCREEN ───────────────────────────────────────────
function AdminLoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAdminAuth, setCurrentView } = useAppStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Login failed');
        return;
      }
      if (data.user?.type !== 'platform_admin' && data.user?.role !== 'PLATFORM_ADMIN') {
        toast.error('Access denied. Platform admin credentials required.');
        return;
      }
      setAdminAuth(
        { id: data.user.id, email: data.user.email, name: data.user.name || data.user.email },
        data.token,
      );
      toast.success('Welcome to the Platform Admin Dashboard');
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
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Platform Admin</h1>
          <p className="text-muted-foreground mt-2">QueueFlow administrative console</p>
        </div>
        <Card className="shadow-lg border-slate-200">
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-email">Admin Email</Label>
                <Input id="admin-email" type="email" placeholder="admin@queueflow.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input id="admin-password" type="password" placeholder="Enter admin password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
          <p className="text-xs text-muted-foreground">Demo: admin@yourqueueapp.com / admin123</p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── OVERVIEW TAB ───────────────────────────────────────────
function OverviewTab() {
  const adminToken = useAppStore((s) => s.adminToken);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.analytics) {
        setAnalytics(data.analytics);
      }
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const stats = analytics ?? { totalTenants: 0, activeToday: 0, totalTicketsServed: 0, totalRevenue: 0 };

  const statCards = [
    { label: 'Total Tenants', value: stats.totalTenants, icon: Building2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Active Today', value: stats.activeToday, icon: Users, color: 'text-amber-600 bg-amber-50' },
    { label: 'Total Tickets Served', value: stats.totalTicketsServed.toLocaleString(), icon: BarChart3, color: 'text-teal-600 bg-teal-50' },
    { label: 'Total Revenue', value: `$${(stats.totalRevenue / 100).toLocaleString()}`, icon: Crown, color: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Platform Overview</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${s.color}`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── TENANTS TAB ────────────────────────────────────────────
function TenantsTab() {
  const adminToken = useAppStore((s) => s.adminToken);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  // Dialog states
  const [detailTenant, setDetailTenant] = useState<TenantRow | null>(null);
  const [editTenant, setEditTenant] = useState<TenantRow | null>(null);
  const [editName, setEditName] = useState('');
  const [topupTenant, setTopupTenant] = useState<TenantRow | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), search });
      const res = await fetch(`/api/admin/tenants?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.tenants) setTenants(data.tenants);
      if (data.pagination) setTotalPages(data.pagination.totalPages || 1);
    } catch {
      toast.error('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [page, search, adminToken]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  // Toggle active/inactive
  const handleToggleActive = async (t: TenantRow) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/tenants/manage', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ tenantId: t.id, isActive: !t.isActive }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update status'); return; }
      toast.success(`${t.name} is now ${!t.isActive ? 'active' : 'inactive'}`);
      fetchTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open edit dialog
  const openEdit = (t: TenantRow) => {
    setEditTenant(t);
    setEditName(t.name);
  };

  // Save edit name
  const handleSaveName = async () => {
    if (!editTenant || !editName.trim()) { toast.error('Name is required'); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/tenants/manage', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ tenantId: editTenant.id, name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update name'); return; }
      toast.success('Tenant name updated');
      setEditTenant(null);
      setEditName('');
      fetchTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Wallet top-up
  const handleTopUp = async () => {
    if (!topupTenant) return;
    const amount = parseFloat(topupAmount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid positive amount'); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/tenants/wallet', {
        method: 'POST',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ tenantId: topupTenant.id, amountCents: Math.round(amount * 100) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to top up wallet'); return; }
      toast.success(`$${amount.toFixed(2)} added to ${topupTenant.name}'s wallet`);
      setTopupTenant(null);
      setTopupAmount('');
      fetchTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h2 className="text-lg font-semibold">All Tenants</h2>
        <div className="flex-1" />
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search tenants..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Plan Tier</TableHead>
                    <TableHead className="hidden md:table-cell">Wallet Balance</TableHead>
                    <TableHead className="hidden lg:table-cell">Tickets Today</TableHead>
                    <TableHead className="hidden lg:table-cell">Staff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No tenants found</TableCell>
                    </TableRow>
                  ) : (
                    tenants.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="capitalize">{t.planTier}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">${(t.walletBalance / 100).toFixed(2)}</TableCell>
                        <TableCell className="hidden lg:table-cell">{t.todayTicketCount}</TableCell>
                        <TableCell className="hidden lg:table-cell">{t.staffCount}</TableCell>
                        <TableCell>
                          <Badge className={t.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                            {t.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailTenant(t)} aria-label={`View ${t.name} details`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit.bind(null, t)} aria-label={`Edit ${t.name} name`}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleActive(t)}
                              disabled={actionLoading}
                              aria-label={t.isActive ? `Deactivate ${t.name}` : `Activate ${t.name}`}
                            >
                              {t.isActive ? <ShieldX className="w-4 h-4 text-red-500" /> : <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setTopupTenant(t); setTopupAmount(''); }} aria-label={`Top up ${t.name} wallet`}>
                              <Wallet className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* ── View Details Dialog ── */}
      <Dialog open={!!detailTenant} onOpenChange={(open) => { if (!open) setDetailTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tenant Details</DialogTitle>
            <DialogDescription>Complete information for this tenant.</DialogDescription>
          </DialogHeader>
          {detailTenant && (
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{detailTenant.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Plan Tier</p>
                  <p className="font-medium capitalize">{detailTenant.planTier}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Wallet Balance</p>
                  <p className="font-medium">${(detailTenant.walletBalance / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={detailTenant.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                    {detailTenant.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Staff Count</p>
                  <p className="font-medium">{detailTenant.staffCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tickets Today</p>
                  <p className="font-medium">{detailTenant.todayTicketCount}</p>
                </div>
                {detailTenant.createdAt && (
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{new Date(detailTenant.createdAt).toLocaleDateString()}</p>
                  </div>
                )}
                {detailTenant.masterTenant && (
                  <div>
                    <p className="text-muted-foreground">Master Tenant</p>
                    <p className="font-medium">{detailTenant.masterTenant.corporateName}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTenant(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Name Dialog ── */}
      <Dialog open={!!editTenant} onOpenChange={(open) => { if (!open) setEditTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant Name</DialogTitle>
            <DialogDescription>Change the display name for this tenant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label>New Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Enter new tenant name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTenant(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveName} disabled={actionLoading || !editName.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Wallet Top-Up Dialog ── */}
      <Dialog open={!!topupTenant} onOpenChange={(open) => { if (!open) setTopupTenant(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wallet Top-Up</DialogTitle>
            <DialogDescription>Add funds to {topupTenant?.name}'s wallet. Current balance: ${topupTenant ? (topupTenant.walletBalance / 100).toFixed(2) : '0.00'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label>Amount (USD)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              placeholder="e.g. 50.00"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopupTenant(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleTopUp} disabled={actionLoading || !topupAmount || parseFloat(topupAmount) <= 0}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Top Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MASTER TENANTS TAB ─────────────────────────────────────
function MasterTenantsTab() {
  const adminToken = useAppStore((s) => s.adminToken);
  const [masterTenants, setMasterTenants] = useState<MasterTenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit corporate name dialog
  const [editMt, setEditMt] = useState<MasterTenantRow | null>(null);
  const [editCorpName, setEditCorpName] = useState('');

  // Add sub-tenant dialog
  const [addSubMt, setAddSubMt] = useState<MasterTenantRow | null>(null);
  const [subName, setSubName] = useState('');
  const [subPlan, setSubPlan] = useState('PRO');
  const [subManagerEmail, setSubManagerEmail] = useState('');
  const [subManagerName, setSubManagerName] = useState('');
  const [subManagerPassword, setSubManagerPassword] = useState('');

  // Delete confirmation
  const [deleteMt, setDeleteMt] = useState<MasterTenantRow | null>(null);

  const fetchMasterTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/master-tenants', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.masterTenants) {
        // Map API response: `tenants` → `subTenants`, derive `isActive` from `billingStatus`
        setMasterTenants(
          data.masterTenants.map((mt: { id: string; corporateName: string; billingStatus: string; createdAt: string; updatedAt: string; tenants?: SubTenantRow[] }) => ({
            id: mt.id,
            corporateName: mt.corporateName,
            billingStatus: mt.billingStatus,
            isActive: mt.billingStatus === 'ACTIVE',
            subTenants: (mt.tenants ?? []) as SubTenantRow[],
            createdAt: mt.createdAt,
            updatedAt: mt.updatedAt,
          }))
        );
      }
    } catch {
      toast.error('Failed to load master tenants');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { fetchMasterTenants(); }, [fetchMasterTenants]);

  // Create master tenant
  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Corporate name is required'); return; }
    setCreating(true);
    try {
      const body: Record<string, unknown> = { corporateName: newName.trim() };
      if (newAdminEmail) {
        body.adminEmail = newAdminEmail;
        body.adminName = newAdminName;
        body.adminPassword = newAdminPassword;
      }
      const res = await fetch('/api/admin/master-tenants', {
        method: 'POST',
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
      toast.success('Master tenant created' + (newAdminEmail ? ' with admin credentials' : ''));
      setCreateOpen(false);
      setNewName('');
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPassword('');
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setCreating(false);
    }
  };

  // Toggle billing status
  const handleToggleBilling = async (mt: MasterTenantRow) => {
    setActionLoading(true);
    const newStatus = mt.billingStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch('/api/admin/master-tenants', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ masterTenantId: mt.id, billingStatus: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update'); return; }
      toast.success(`${mt.corporateName} is now ${newStatus}`);
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Edit corporate name
  const openEditCorp = (mt: MasterTenantRow) => {
    setEditMt(mt);
    setEditCorpName(mt.corporateName);
  };

  const handleSaveCorpName = async () => {
    if (!editMt || !editCorpName.trim()) { toast.error('Corporate name is required'); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/master-tenants', {
        method: 'PUT',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ masterTenantId: editMt.id, corporateName: editCorpName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update name'); return; }
      toast.success('Corporate name updated');
      setEditMt(null);
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete master tenant
  const handleDelete = async () => {
    if (!deleteMt) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/master-tenants', {
        method: 'DELETE',
        headers: adminHeaders(adminToken),
        body: JSON.stringify({ masterTenantId: deleteMt.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to delete'); return; }
      toast.success(`${deleteMt.corporateName} deleted`);
      setDeleteMt(null);
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  // Add sub-tenant (branch)
  const openAddSub = (mt: MasterTenantRow) => {
    setAddSubMt(mt);
    setSubName('');
    setSubPlan('PRO');
    setSubManagerEmail('');
    setSubManagerName('');
    setSubManagerPassword('');
  };

  const handleAddSubTenant = async () => {
    if (!addSubMt) return;
    if (!subName.trim()) { toast.error('Branch name is required'); return; }
    if (subManagerEmail && (!subManagerName || !subManagerPassword)) {
      toast.error('Manager name and password are required when email is provided');
      return;
    }
    if (subManagerPassword && subManagerPassword.length < 8) {
      toast.error('Manager password must be at least 8 characters');
      return;
    }
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: subName.trim(),
        planTier: subPlan,
        masterTenantId: addSubMt.id,
      };
      if (subManagerEmail) {
        body.managerEmail = subManagerEmail;
        body.managerName = subManagerName;
        body.managerPassword = subManagerPassword;
      }
      const res = await fetch('/api/tenants/manage', {
        method: 'POST',
        headers: adminHeaders(adminToken),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create branch'); return; }
      toast.success(`Branch "${subName.trim()}" created under ${addSubMt.corporateName}`);
      setAddSubMt(null);
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Master Tenants (Franchise Groups)</h2>
        <div className="flex-1" />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700" size="sm">
              <Plus className="w-4 h-4 mr-1" /> Create Master Tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Master Tenant</DialogTitle>
              <DialogDescription>Add a new franchise or corporate group.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-2">
                <Label>Corporate Name *</Label>
                <Input placeholder="e.g. CityHealth Medical Group" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground font-medium">HQ Admin Credentials (Optional)</p>
              <div className="space-y-2">
                <Label>Admin Email</Label>
                <Input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="hq@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Admin Name</Label>
                <Input value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Admin Password</Label>
                <Input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="Min 8 chars, 1 uppercase, 1 digit" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : masterTenants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No master tenants yet.</CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {masterTenants.map((mt) => (
            <motion.div key={mt.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                      <Crown className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{mt.corporateName}</CardTitle>
                      <CardDescription className="text-xs">{mt.billingStatus} &middot; {mt.subTenants?.length || 0} branches</CardDescription>
                    </div>
                    <Badge className={mt.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                      {mt.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Separator />
                  <p className="text-sm font-medium text-muted-foreground">
                    Sub-Tenants ({mt.subTenants?.length || 0})
                  </p>
                  <ScrollArea className="max-h-40">
                    <div className="space-y-1.5">
                      {mt.subTenants?.map((st) => (
                        <div key={st.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded-md bg-slate-50">
                          <span className="truncate">{st.name}</span>
                          <Badge variant="outline" className="text-xs ml-2 shrink-0">{st.planTier}</Badge>
                        </div>
                      ))}
                      {(!mt.subTenants || mt.subTenants.length === 0) && (
                        <p className="text-xs text-muted-foreground px-2">No branches yet</p>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1 pt-1">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openEditCorp(mt)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Rename
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleToggleBilling(mt)} disabled={actionLoading}>
                      {mt.isActive ? <ShieldX className="w-3.5 h-3.5 mr-1" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1" />}
                      {mt.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openAddSub(mt)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Branch
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-red-500 hover:text-red-600 ml-auto" onClick={() => setDeleteMt(mt)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Edit Corporate Name Dialog ── */}
      <Dialog open={!!editMt} onOpenChange={(open) => { if (!open) setEditMt(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Corporate Name</DialogTitle>
            <DialogDescription>Change the corporate name for this master tenant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <Label>Corporate Name</Label>
            <Input value={editCorpName} onChange={(e) => setEditCorpName(e.target.value)} placeholder="Enter new corporate name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMt(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveCorpName} disabled={actionLoading || !editCorpName.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Sub-Tenant Dialog ── */}
      <Dialog open={!!addSubMt} onOpenChange={(open) => { if (!open) setAddSubMt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Branch</DialogTitle>
            <DialogDescription>Create a new tenant under {addSubMt?.corporateName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-2">
              <Label>Branch Name *</Label>
              <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="e.g. Downtown Clinic" />
            </div>
            <div className="space-y-2">
              <Label>Plan Tier</Label>
              <div className="flex gap-2">
                {(['FREE', 'PRO', 'ENTERPRISE'] as const).map((tier) => (
                  <Button
                    key={tier}
                    variant={subPlan === tier ? 'default' : 'outline'}
                    size="sm"
                    className={subPlan === tier ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                    onClick={() => setSubPlan(tier)}
                  >
                    {tier}
                  </Button>
                ))}
              </div>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground font-medium">Manager (Optional)</p>
            <div className="space-y-2">
              <Label>Manager Email</Label>
              <Input type="email" value={subManagerEmail} onChange={(e) => setSubManagerEmail(e.target.value)} placeholder="manager@clinic.com" />
            </div>
            <div className="space-y-2">
              <Label>Manager Name</Label>
              <Input value={subManagerName} onChange={(e) => setSubManagerName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Manager Password</Label>
              <Input type="password" value={subManagerPassword} onChange={(e) => setSubManagerPassword(e.target.value)} placeholder="Min 8 chars, 1 uppercase, 1 digit" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubMt(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddSubTenant} disabled={actionLoading || !subName.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!deleteMt} onOpenChange={(open) => { if (!open) setDeleteMt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Master Tenant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteMt?.corporateName}</strong>? This action cannot be undone. Master tenants with existing branches cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── AUDIT LOG TAB ──────────────────────────────────────────
function AuditLogTab() {
  const adminToken = useAppStore((s) => s.adminToken);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const res = await fetch(`/api/admin/audit-log?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
      if (data.pagination) {
        setTotalPages(data.pagination.pages || 1);
        setTotal(data.pagination.total || 0);
      }
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, adminToken]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getActionColor = (action: string) => {
    if (action.includes('DELETE')) return 'bg-red-100 text-red-700';
    if (action.includes('CREATE')) return 'bg-emerald-100 text-emerald-700';
    if (action.includes('UPDATE')) return 'bg-amber-100 text-amber-700';
    if (action.includes('TOP_UP') || action.includes('WALLET')) return 'bg-teal-100 text-teal-700';
    if (action.includes('LOGIN') || action.includes('AUTH')) return 'bg-purple-100 text-purple-700';
    return 'bg-slate-100 text-slate-700';
  };

  const truncateDetails = (details: string, maxLen = 80) => {
    if (!details) return '—';
    try {
      const parsed = JSON.parse(details);
      const str = JSON.stringify(parsed);
      return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
    } catch {
      return details.length > maxLen ? details.slice(0, maxLen) + '…' : details;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <div className="flex-1" />
        <Badge variant="outline" className="text-xs">{total} total entries</Badge>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No audit logs found</p>
              <p className="text-sm mt-1">Actions will appear here as they occur.</p>
            </div>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Timestamp</TableHead>
                    <TableHead className="w-[150px]">Action</TableHead>
                    <TableHead className="hidden sm:table-cell">Actor</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">IP Address</TableHead>
                    <TableHead className="hidden xl:table-cell">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${getActionColor(log.action)}`}>
                          {formatAction(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        <div>
                          <p className="font-medium truncate max-w-[160px]">{log.actorName || log.userId}</p>
                          {log.actorEmail && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{log.actorEmail}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-xs capitalize">{log.userType.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
                        {log.ipAddress}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground max-w-[200px] truncate" title={log.details}>
                        {truncateDetails(log.details)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN SIDEBAR ──────────────────────────────────────────
function AdminSidebar({ navItems, adminTab, setAdminTab, adminUser, logout }: {
  navItems: Array<{ id: AdminTab; label: string; icon: typeof Shield }>;
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  adminUser: { id: string; email: string; name: string };
  logout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-sm">QueueFlow</p>
            <p className="text-xs text-muted-foreground">Platform Admin</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Admin navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setAdminTab(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              adminTab === item.id
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
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{adminUser.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{adminUser.name}</p>
            <p className="text-xs text-muted-foreground truncate">{adminUser.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>
    </div>
  );
}

// ─── MAIN PLATFORM ADMIN VIEW ───────────────────────────────
export default function PlatformAdminView() {
  const { adminUser, adminToken, adminLogout, setCurrentView } = useAppStore();
  const [adminTab, setAdminTab] = useState<AdminTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Restore admin auth from localStorage on mount
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('qms_admin_token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('qms_admin_user') : null;
    if (token && userStr && !adminUser) {
      try {
        const user = JSON.parse(userStr);
        useAppStore.getState().setAdminAuth(user, token);
      } catch { /* invalid stored data */ }
    }
  }, [adminUser]);

  if (!adminUser) {
    return <AdminLoginScreen />;
  }

  const navItems: Array<{ id: AdminTab; label: string; icon: typeof Shield }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'tenants', label: 'Tenants', icon: Building2 },
    { id: 'masterTenants', label: 'Master Tenants', icon: Crown },
    { id: 'auditLog', label: 'Audit Log', icon: FileText },
  ];

  return (
    <div className="h-screen flex flex-row overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-white shrink-0 h-full">
        <AdminSidebar navItems={navItems} adminTab={adminTab} setAdminTab={(t) => { setAdminTab(t); setSidebarOpen(false); }} adminUser={adminUser} logout={adminLogout} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 shadow-xl md:hidden">
              <AdminSidebar navItems={navItems} adminTab={adminTab} setAdminTab={(t) => { setAdminTab(t); setSidebarOpen(false); }} adminUser={adminUser} logout={adminLogout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-white flex items-center px-4 gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">Platform Admin</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">{adminUser.email}</p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700">Admin</Badge>
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{adminUser.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div key={adminTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
              {adminTab === 'overview' && <OverviewTab />}
              {adminTab === 'tenants' && <TenantsTab />}
              {adminTab === 'masterTenants' && <MasterTenantsTab />}
              {adminTab === 'auditLog' && <AuditLogTab />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden border-t bg-white flex shrink-0 safe-area-bottom" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setAdminTab(item.id)}
              className={`flex-1 flex flex-col items-center py-2.5 text-xs transition-colors ${
                adminTab === item.id ? 'text-emerald-600' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="mt-0.5">{item.label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}