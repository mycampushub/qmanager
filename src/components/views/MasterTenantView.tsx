'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, BarChart3, LogOut, Menu, X, ChevronLeft,
  Loader2, Crown, Eye, ListOrdered, Clock, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { Tenant, StaffUser } from '@/lib/types';

// ─── TYPES ──────────────────────────────────────────────────
interface BranchData {
  id: string;
  name: string;
  queueCount: number;
  ticketsToday: number;
  walletBalance: number;
  isActive: boolean;
}

interface BranchAnalytics {
  branchName: string;
  totalTickets: number;
  avgWaitTime: number;
  avgServiceTime: number;
  completionRate: number;
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

// ─── LOGIN SCREEN ───────────────────────────────────────────
function MTLoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth, setCurrentView } = useAppStore();

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
      // Check if user belongs to a master tenant
      const user = data.user as StaffUser & { tenant?: Tenant };
      if (!user.tenant?.masterTenantId) {
        toast.error('Your account is not part of a franchise group.');
        return;
      }
      setAuth(user, data.token);
      toast.success(`Welcome back, ${user.name}!`);
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
                <Input id="mt-email" type="email" placeholder="hq@cityhealth.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mt-password">Password</Label>
                <Input id="mt-password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
          <p className="text-xs text-muted-foreground">Demo: manager@cityhealthdowntown.com / manager123</p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── BRANCHES TAB ───────────────────────────────────────────
function BranchesTab({ masterTenantId }: { masterTenantId: string }) {
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tenants');
        const data = await res.json();
        if (data.tenants) {
          const filtered = data.tenants
            .filter((t: Tenant) => t.masterTenantId === masterTenantId)
            .map((t: Tenant) => ({
              id: t.id,
              name: t.name,
              queueCount: t._queueCount ?? 0,
              ticketsToday: t._activeTickets ?? 0,
              walletBalance: t.walletBalance,
              isActive: t.isActive,
            }));
          setBranches(filtered);
        }
      } catch {
        toast.error('Failed to load branches');
      } finally {
        setLoading(false);
      }
    })();
  }, [masterTenantId]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Branches Overview</h2>
      {branches.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No branches found under your franchise group.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{b.name}</CardTitle>
                    </div>
                    <Badge className={b.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                      {b.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-2xl font-bold">{b.queueCount}</p>
                      <p className="text-xs text-muted-foreground">Queues</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{b.ticketsToday}</p>
                      <p className="text-xs text-muted-foreground">Tickets Today</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">${(b.walletBalance / 100).toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">Wallet</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CROSS-BRANCH ANALYTICS TAB ─────────────────────────────
function CrossBranchAnalyticsTab({ masterTenantId }: { masterTenantId: string }) {
  const [analytics, setAnalytics] = useState<BranchAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tenants');
        const data = await res.json();
        if (data.tenants) {
          const filtered = data.tenants.filter((t: Tenant) => t.masterTenantId === masterTenantId);
          // Use real ticket counts from tenant data; show N/A for avg wait/service times
          // since there's no cross-branch analytics API
          const branchAnalytics: BranchAnalytics[] = filtered.map((t: Tenant) => ({
            branchName: t.name,
            totalTickets: t._activeTickets ?? 0,
            avgWaitTime: -1, // N/A indicator
            avgServiceTime: -1, // N/A indicator
            completionRate: -1, // N/A indicator
          }));
          setAnalytics(branchAnalytics);
        }
      } catch {
        toast.error('Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, [masterTenantId]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Cross-Branch Analytics</h2>
      <Card>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="hidden sm:table-cell">Active Tickets</TableHead>
                  <TableHead className="hidden md:table-cell">Avg Wait Time</TableHead>
                  <TableHead className="hidden md:table-cell">Avg Service Time</TableHead>
                  <TableHead>Completion Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No branch data available</TableCell>
                  </TableRow>
                ) : (
                  analytics.map((a) => (
                    <TableRow key={a.branchName}>
                      <TableCell className="font-medium">{a.branchName}</TableCell>
                      <TableCell className="hidden sm:table-cell">{a.totalTickets}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.avgWaitTime < 0 ? <span className="text-muted-foreground text-xs">N/A</span> : formatTime(a.avgWaitTime)}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.avgServiceTime < 0 ? <span className="text-muted-foreground text-xs">N/A</span> : formatTime(a.avgServiceTime)}</TableCell>
                      <TableCell>
                        {a.completionRate < 0 ? (
                          <span className="text-muted-foreground text-xs">N/A</span>
                        ) : (
                          <Badge className={a.completionRate >= 90 ? 'bg-emerald-100 text-emerald-700' : a.completionRate >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}>
                            {a.completionRate}%
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground text-center">
        Average wait time, service time, and completion rate require a dedicated cross-branch analytics API.
      </p>
    </div>
  );
}

// ─── STAFF TAB ──────────────────────────────────────────────
function StaffTab({ masterTenantId }: { masterTenantId: string }) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tenants');
        const data = await res.json();
        if (data.tenants) {
          const filtered = data.tenants.filter((t: Tenant) => t.masterTenantId === masterTenantId);
          // Placeholder staff data — in production, this would be a dedicated API
          const allStaff: StaffRow[] = [];
          for (const t of filtered) {
            allStaff.push(
              { id: `${t.id}-m`, name: `${t.name} Manager`, email: `manager@${t.name.toLowerCase().replace(/\s/g, '')}.com`, role: 'MANAGER', branchName: t.name, isActive: true },
              { id: `${t.id}-a1`, name: `Agent 1 - ${t.name}`, email: `agent1@${t.name.toLowerCase().replace(/\s/g, '')}.com`, role: 'AGENT', branchName: t.name, isActive: true },
              { id: `${t.id}-a2`, name: `Agent 2 - ${t.name}`, email: `agent2@${t.name.toLowerCase().replace(/\s/g, '')}.com`, role: 'AGENT', branchName: t.name, isActive: true },
            );
          }
          setStaff(allStaff);
        }
      } catch {
        toast.error('Failed to load staff');
      } finally {
        setLoading(false);
      }
    })();
  }, [masterTenantId]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Staff Across All Branches</h2>
      <p className="text-xs text-muted-foreground">
        Staff data shown per branch is for demonstration. Full staff management is available in each branch&apos;s dashboard.
      </p>
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
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No staff found</TableCell>
                  </TableRow>
                ) : (
                  staff.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{s.name.charAt(0)}</AvatarFallback>
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
function MTSidebar({ navItems, mtTab, setMTTab, userName, userRole, logout }: {
  navItems: Array<{ id: MTTab; label: string; icon: typeof Building2 }>;
  mtTab: MTTab;
  setMTTab: (tab: MTTab) => void;
  userName: string;
  userRole: string;
  logout: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-sm">QueueFlow</p>
            <p className="text-xs text-muted-foreground">Franchise HQ</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1" aria-label="Tenant navigation">
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
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{userName.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userRole}</p>
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
  const { authUser, logout, setCurrentView } = useAppStore();
  const [mtTab, setMTTab] = useState<MTTab>('branches');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Check auth on mount — restore from localStorage
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('qms_token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('qms_user') : null;
    if (token && userStr && !authUser) {
      try {
        const user = JSON.parse(userStr);
        useAppStore.getState().setAuth(user, token);
      } catch { /* invalid stored data */ }
    }
  }, [authUser]);

  if (!authUser) {
    return <MTLoginScreen />;
  }

  // Get masterTenantId from the user's tenant
  const masterTenantId = (authUser as StaffUser & { tenant?: Tenant }).tenant?.masterTenantId;

  if (!masterTenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Crown className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold">Not a Franchise Member</h2>
            <p className="text-sm text-muted-foreground mt-2">Your account does not belong to a franchise group.</p>
            <Button variant="outline" className="mt-4" onClick={() => setCurrentView('marketing')}>Back to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const navItems: Array<{ id: MTTab; label: string; icon: typeof Building2 }> = [
    { id: 'branches', label: 'Branches', icon: Building2 },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'staff', label: 'Staff', icon: Users },
  ];

  const tenantName = (authUser as StaffUser & { tenant?: Tenant }).tenant?.name || 'Franchise HQ';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r bg-white shrink-0">
        <MTSidebar navItems={navItems} mtTab={mtTab} setMTTab={(t) => { setMTTab(t); setSidebarOpen(false); }} userName={authUser.name} userRole={authUser.role} logout={logout} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed left-0 top-0 bottom-0 w-64 bg-white z-50 shadow-xl lg:hidden">
              <MTSidebar navItems={navItems} mtTab={mtTab} setMTTab={(t) => { setMTTab(t); setSidebarOpen(false); }} userName={authUser.name} userRole={authUser.role} logout={logout} />
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
            <h1 className="text-sm font-semibold truncate">{tenantName}</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">{authUser.email}</p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700">HQ</Badge>
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{authUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div key={mtTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
              {mtTab === 'branches' && <BranchesTab masterTenantId={masterTenantId} />}
              {mtTab === 'analytics' && <CrossBranchAnalyticsTab masterTenantId={masterTenantId} />}
              {mtTab === 'staff' && <StaffTab masterTenantId={masterTenantId} />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="lg:hidden border-t bg-white flex shrink-0 safe-area-bottom" aria-label="Mobile navigation">
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