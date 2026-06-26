'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Building2, Users, BarChart3, FileText, Plus, Search,
  Loader2, LogOut, Menu, X, ChevronLeft, Eye, Crown,
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
  ticketsToday: number;
  staffCount: number;
  isActive: boolean;
  masterTenantId: string | null;
  masterTenant?: { id: string; corporateName: string } | null;
}

interface MasterTenantRow {
  id: string;
  corporateName: string;
  billingEmail: string;
  isActive: boolean;
  subTenants: TenantRow[];
}

type AdminTab = 'overview' | 'tenants' | 'masterTenants' | 'auditLog';

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
      // Only allow platform_admin type
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
          <p className="text-xs text-muted-foreground">Demo: admin@queueflow.com / admin123</p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── OVERVIEW TAB ───────────────────────────────────────────
function OverviewTab() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics');
      const data = await res.json();
      if (data.analytics) {
        setAnalytics(data.analytics);
      }
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const stats = analytics ?? { totalTenants: 0, activeToday: 0, totalTicketsServed: 0, totalRevenue: 0 };

  const statCards = [
    { label: 'Total Tenants', value: stats.totalTenants, icon: Building2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Active Today', value: stats.activeToday, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Total Tickets Served', value: stats.totalTicketsServed.toLocaleString(), icon: BarChart3, color: 'text-amber-600 bg-amber-50' },
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
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), search });
      const res = await fetch(`/api/admin/tenants?${params}`);
      const data = await res.json();
      if (data.tenants) setTenants(data.tenants);
      if (data.pagination) setTotalPages(data.pagination.totalPages || 1);
    } catch {
      toast.error('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

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
                        <TableCell className="hidden lg:table-cell">{t.ticketsToday}</TableCell>
                        <TableCell className="hidden lg:table-cell">{t.staffCount}</TableCell>
                        <TableCell>
                          <Badge className={t.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                            {t.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast.info(`Viewing ${t.name} (details coming soon)`)} aria-label={`View ${t.name} details`}>
                            <Eye className="w-4 h-4" />
                          </Button>
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
            Next <ChevronLeft className="w-4 h-4 ml-1 rotate-180" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── MASTER TENANTS TAB ─────────────────────────────────────
function MasterTenantsTab() {
  const [masterTenants, setMasterTenants] = useState<MasterTenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchMasterTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/master-tenants');
      const data = await res.json();
      if (data.masterTenants) setMasterTenants(data.masterTenants);
    } catch {
      toast.error('Failed to load master tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMasterTenants(); }, [fetchMasterTenants]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('Corporate name is required'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/master-tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corporateName: newName, billingEmail: newEmail }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to create'); return; }
      toast.success('Master tenant created');
      setCreateOpen(false);
      setNewName('');
      setNewEmail('');
      fetchMasterTenants();
    } catch {
      toast.error('Network error');
    } finally {
      setCreating(false);
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Master Tenant</DialogTitle>
              <DialogDescription>Add a new franchise or corporate group.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Corporate Name</Label>
                <Input placeholder="e.g. CityHealth Medical Group" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Billing Email</Label>
                <Input type="email" placeholder="billing@cityhealth.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate} disabled={creating}>
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
                      <CardDescription className="text-xs">{mt.billingEmail}</CardDescription>
                    </div>
                    <Badge className={mt.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                      {mt.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Separator className="mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-2">
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
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AUDIT LOG TAB (PLACEHOLDER) ────────────────────────────
function AuditLogTab() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Audit Log</h2>
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Coming Soon</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            Audit log records are being captured and stored. A dedicated audit log API and export functionality will be available in a future release.
          </p>
          <Badge variant="outline" className="mt-4 text-xs">Records available via admin API</Badge>
        </CardContent>
      </Card>
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
      <nav className="flex-1 p-3 space-y-1" aria-label="Admin navigation">
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
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r bg-white shrink-0">
        <AdminSidebar navItems={navItems} adminTab={adminTab} setAdminTab={(t) => { setAdminTab(t); setSidebarOpen(false); }} adminUser={adminUser} logout={adminLogout} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 shadow-xl lg:hidden">
              <AdminSidebar navItems={navItems} adminTab={adminTab} setAdminTab={(t) => { setAdminTab(t); setSidebarOpen(false); }} adminUser={adminUser} logout={adminLogout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-white flex items-center px-4 gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu">
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
        <nav className="lg:hidden border-t bg-white flex shrink-0 safe-area-bottom" aria-label="Mobile navigation">
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