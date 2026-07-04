'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Users, BarChart3, LogOut, Menu, Loader2, Crown,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { MasterTenantAdminUser } from '@/stores/app-store';
import type { MTTab } from '@/components/master-tenant/mt-types';
import BranchesTab from '@/components/master-tenant/BranchesTab';
import CrossBranchAnalyticsTab from '@/components/master-tenant/CrossBranchAnalytics';
import MtStaffTab from '@/components/master-tenant/MtStaffTab';

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
          <h1 className="text-3xl font-bold text-foreground">Master Tenant Admin</h1>
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
      <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Branch navigation">
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

  const corporateName = mtUser.masterTenant?.corporateName || 'Master Tenant Admin';

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
          <Badge className="bg-emerald-100 text-emerald-700">MT Admin</Badge>
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
              {mtTab === 'staff' && <MtStaffTab />}
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