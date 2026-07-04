'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Building2, BarChart3, FileText, Crown, Loader2, LogOut, Menu, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';

// ─── RE-EXPORT SHARED TYPES (backward compatibility) ────
export type {
  AdminAnalytics,
  TenantRow,
  SubTenantRow,
  MasterTenantRow,
  AuditLogRow,
  AdminTab,
} from '@/components/platform-admin/types';
export { adminHeaders } from '@/components/platform-admin/types';

// ─── IMPORT EXTRACTED TABS ──────────────────────────────
import OverviewTab from '@/components/platform-admin/OverviewTab';
import TenantsTab from '@/components/platform-admin/TenantsTab';
import MasterTenantsTab from '@/components/platform-admin/MasterTenantsTab';
import AuditLogTab from '@/components/platform-admin/AuditLogTab';

// ─── LOCAL IMPORT OF TYPES ──────────────────────────────
import type { AdminTab } from '@/components/platform-admin/types';

// ─── LOGIN SCREEN ───────────────────────────────────────
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

// ─── ADMIN SIDEBAR ──────────────────────────────────────
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

// ─── MAIN PLATFORM ADMIN VIEW ───────────────────────────
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
          <Badge className="bg-emerald-100 text-emerald-700">Platform Admin</Badge>
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