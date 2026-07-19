'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, Users, BarChart3, Wallet, Palette, ListOrdered,
  Phone, CalendarClock, Star, Webhook, Settings,
  Menu, MoreHorizontal, KeyRound, Monitor, Globe,
  MapPin, Coffee, MonitorDot
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { useLocale } from '@/lib/i18n';
import type { Queue, StaffUser } from '@/lib/types';
import ServiceWindowsTab from '@/components/tabs/ServiceWindowsTab';
import AppointmentsTab from '@/components/tabs/AppointmentsTab';
import FeedbackTab from '@/components/tabs/FeedbackTab';
import WebhooksTab from '@/components/tabs/WebhooksTab';
import SettingsTab from '@/components/tabs/SettingsTab';
import LocationsTab from '@/components/tabs/LocationsTab';
import BreaksTab from '@/components/tabs/BreaksTab';
import CountersTab from '@/components/tabs/CountersTab';

// Extracted sub-components
import { LoginScreen } from '@/components/dashboard/LoginForm';
import { AgentView } from '@/components/dashboard/AgentView';
import { QueuesTab } from '@/components/dashboard/QueuesTab';
import { AnalyticsTab } from '@/components/dashboard/AnalyticsTab';
import { WalletTab } from '@/components/dashboard/WalletTab';
import { BrandingTab } from '@/components/dashboard/BrandingTab';
import { StaffTab } from '@/components/dashboard/StaffTab';
import { usePwa } from '@/hooks/use-pwa';
import { PwaInstallButton } from '@/components/PwaInstallButton';

// ─── CHANGE PASSWORD DIALOG ─────────────────────────────────
function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const authToken = useAppStore((s) => s.authToken);

  const resetForm = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to change password'); return; }
      toast.success('Password changed successfully');
      onOpenChange(false);
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cp-current">Current Password *</Label>
            <Input id="cp-current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-new">New Password * <span className="text-xs text-muted-foreground">(min 8 chars)</span></Label>
            <Input id="cp-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirm">Confirm New Password *</Label>
            <Input id="cp-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading && <>{/* spinner handled by disabled state */}</>}
              Update Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DashboardSidebar({ navItems, dashboardTab, setDashboardTab, authUser, logout, tenantId, pwa }: {
  navItems: Array<{ id: string; label: string; icon: typeof Phone }>;
  dashboardTab: string;
  setDashboardTab: (id: string) => void;
  authUser: StaffUser;
  logout: () => void;
  tenantId: string;
  pwa: { canInstall: boolean; isInstalled: boolean; isSupported: boolean; promptInstall: () => Promise<boolean> };
}) {
  const [changePwdOpen, setChangePwdOpen] = useState(false);

  const displayUrl = typeof window !== 'undefined' ? `${window.location.origin}/?display=${tenantId}` : '';

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">QF</div>
          <div>
            <p className="font-semibold text-sm">QueueFlow</p>
            <p className="text-xs text-muted-foreground">Dashboard</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Dashboard navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setDashboardTab(item.id)}
            aria-current={dashboardTab === item.id ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-3.5 sm:py-3 rounded-lg text-sm transition-colors ${
              dashboardTab === item.id
                ? 'bg-emerald-50 text-emerald-700 font-medium'
                : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t shrink-0 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{authUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{authUser.name}</p>
            <p className="text-xs text-muted-foreground truncate">{authUser.role === 'MANAGER' ? (authUser.tenant?.masterTenantId ? 'Branch Manager' : 'Admin (Tenant Admin)') : 'Agent'}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground h-10" onClick={() => setChangePwdOpen(true)}>
          <KeyRound className="w-4 h-4 mr-2" /> Change Password
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-10"
          onClick={() => displayUrl && window.open(displayUrl, '_blank')}
        >
          <Monitor className="w-4 h-4 mr-2" /> TV Display
        </Button>
        <PwaInstallButton
          canInstall={pwa.canInstall}
          isInstalled={pwa.isInstalled}
          isSupported={pwa.isSupported}
          promptInstall={pwa.promptInstall}
          variant="sidebar"
        />
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground h-10" onClick={logout}>
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>
      <ChangePasswordDialog open={changePwdOpen} onOpenChange={setChangePwdOpen} />
    </div>
  );
}

// ─── MAIN DASHBOARD ─────────────────────────────────────────
export default function DashboardView() {
  const { authUser, authToken, logout, dashboardTab, setDashboardTab } = useAppStore();
  const { locale, setLocale } = useLocale();
  const [tenantData, setTenantData] = useState<{ queues: Queue[] } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const tenantIdRef = useRef(authUser?.tenantId);
  const isManager = authUser?.role === 'MANAGER';

  // PWA — only activates for logged-in users
  const pwa = usePwa(!!authUser);

  const fetchTenantData = useCallback(async () => {
    const tid = tenantIdRef.current;
    if (!tid) return;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = useAppStore.getState().authToken;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tenantId: tid }),
      });
      const data = await res.json();
      if (data.tenant) {
        setTenantData(data.tenant);
      }
    } catch { /* silent */ }
  }, []);

  // Check auth on mount
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('qms_token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('qms_user') : null;
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        useAppStore.getState().setAuth(user, token);
      } catch { /* invalid stored data */ }
    }
  }, []);

  useEffect(() => {
    tenantIdRef.current = authUser?.tenantId;
    if (authUser?.tenantId) {
      fetchTenantData();
    }
  }, [authUser?.tenantId, fetchTenantData]);

  // G1: Mobile menu state (must be before early return for hooks ordering)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // G1: Close mobile sidebar/menu on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sidebarOpen) setSidebarOpen(false);
        if (mobileMenuOpen) setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [sidebarOpen, mobileMenuOpen]);

  // Show login if not authenticated
  if (!authUser) {
    return <LoginScreen />;
  }

  const navItems = [
    { id: 'agent' as const, label: 'Agent View', icon: Phone },
    { id: 'queues' as const, label: 'Queues', icon: ListOrdered },
    ...(isManager ? [
      { id: 'locations' as const, label: 'Locations', icon: MapPin },
      { id: 'breaks' as const, label: 'Breaks', icon: Coffee },
      { id: 'counters' as const, label: 'Counters', icon: MonitorDot },
      { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
      { id: 'wallet' as const, label: 'Wallet', icon: Wallet },
      { id: 'service-windows' as const, label: 'Hours', icon: CalendarClock },
      { id: 'appointments' as const, label: 'Appts', icon: CalendarClock },
      { id: 'feedback' as const, label: 'Feedback', icon: Star },
      { id: 'webhooks' as const, label: 'Webhooks', icon: Webhook },
      { id: 'branding' as const, label: 'Branding', icon: Palette },
      { id: 'staff' as const, label: 'Staff', icon: Users },
      { id: 'settings' as const, label: 'Settings', icon: Settings },
    ] : [])
  ];

  // E1: Mobile nav — show most useful items for managers, overflow into "More" sheet
  const mobileNavItemIds = isManager
    ? ['agent', 'queues', 'analytics', 'counters']
    : navItems.slice(0, 4).map(n => n.id);
  const mobileNavItems = mobileNavItemIds.map(id => navItems.find(n => n.id === id)!).filter(Boolean);
  const mobileNavIdSet = new Set(mobileNavItemIds);
  const moreNavItems = navItems.filter(n => !mobileNavIdSet.has(n.id));
  const showMoreButton = moreNavItems.length > 0;

  return (
    <div className="h-screen flex flex-row overflow-hidden bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r bg-white shrink-0 h-full">
        <DashboardSidebar navItems={navItems} dashboardTab={dashboardTab} setDashboardTab={(id) => { setDashboardTab(id as typeof dashboardTab); setSidebarOpen(false); }} authUser={authUser} logout={logout} tenantId={authUser.tenantId} pwa={pwa} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed left-0 top-0 bottom-0 w-72 sm:w-80 bg-white z-50 shadow-xl md:hidden">
              <DashboardSidebar navItems={navItems} dashboardTab={dashboardTab} setDashboardTab={(id) => { setDashboardTab(id as typeof dashboardTab); setSidebarOpen(false); }} authUser={authUser} logout={logout} tenantId={authUser.tenantId} pwa={pwa} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-12 sm:h-14 border-b bg-white flex items-center px-4 gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="md:hidden h-10 w-10" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu">
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{authUser.tenant?.name || 'Dashboard'}</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">{authUser.email}</p>
          </div>
          <Badge variant={isManager ? 'default' : 'secondary'} className={`text-[10px] sm:text-xs px-1.5 sm:px-2.5 ${isManager ? 'bg-emerald-100 text-emerald-700' : ''}`}>
            {isManager ? (authUser?.tenant?.masterTenantId ? 'Branch Manager' : 'Admin (Tenant Admin)') : 'Agent'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
            className="h-8 px-2 gap-1 text-muted-foreground hover:text-foreground hidden sm:flex"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="text-xs">{locale === 'en' ? 'বাংলা' : 'EN'}</span>
          </Button>
          <Avatar className="w-7 h-7 sm:w-8 sm:h-8">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{authUser.name.charAt(0)}</AvatarFallback>
          </Avatar>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 overflow-auto overscroll-y-contain">
          <AnimatePresence mode="wait">
            <motion.div key={dashboardTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
              {dashboardTab === 'agent' && (
                <AgentView user={authUser} tenantData={tenantData} tenantName={authUser.tenant?.name || ''} onRefresh={fetchTenantData} />
              )}
              {dashboardTab === 'queues' && (
                <QueuesTab user={authUser} tenantData={tenantData} onRefresh={fetchTenantData} />
              )}
              {dashboardTab === 'analytics' && isManager && (
                <AnalyticsTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'wallet' && isManager && (
                <WalletTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'branding' && isManager && (
                <BrandingTab tenantId={authUser.tenantId} tenantName={authUser.tenant?.name || ''} />
              )}
              {dashboardTab === 'staff' && isManager && (
                <StaffTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'service-windows' && isManager && (
                <ServiceWindowsTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'appointments' && isManager && (
                <AppointmentsTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'feedback' && isManager && (
                <FeedbackTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'locations' && isManager && (
                <LocationsTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'breaks' && isManager && (
                <BreaksTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'counters' && isManager && (
                <CountersTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'webhooks' && isManager && (
                <WebhooksTab tenantId={authUser.tenantId} />
              )}
              {dashboardTab === 'settings' && isManager && (
                <SettingsTab tenantId={authUser.tenantId} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* E1: Mobile Bottom Nav — max 5 items with "More" sheet */}
        <nav className="md:hidden border-t bg-white flex shrink-0 safe-area-bottom" aria-label="Mobile navigation">
          {mobileNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setDashboardTab(item.id)}
              className={`flex-1 flex flex-col items-center py-3 min-h-[48px] sm:min-h-[44px] text-[10px] sm:text-xs transition-colors active:scale-95 transition-transform ${
                dashboardTab === item.id ? 'text-emerald-600 border-t-2 border-emerald-500' : 'text-muted-foreground'
              }`}
              aria-current={dashboardTab === item.id ? 'page' : undefined}
            >
              <item.icon className="w-5 h-5" />
              <span className="mt-0.5">{item.label.split(' ')[0]}</span>
            </button>
          ))}
          {showMoreButton && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={`flex-1 flex flex-col items-center py-3 min-h-[48px] sm:min-h-[44px] text-[10px] sm:text-xs transition-colors active:scale-95 transition-transform text-muted-foreground`}
              aria-label="More menu options"
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="mt-0.5">More</span>
            </button>
          )}
        </nav>

        {/* E1: More menu sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="bottom" className="max-h-[60vh]">
            <SheetHeader>
              <SheetTitle>More Options</SheetTitle>
            </SheetHeader>
            <nav className="grid grid-cols-3 sm:grid-cols-4 gap-2 py-4" aria-label="Additional navigation">
              {moreNavItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setDashboardTab(item.id); setMobileMenuOpen(false); }}
                  className={`flex flex-col items-center gap-2 p-3 min-h-[56px] sm:min-h-[48px] rounded-xl transition-colors ${
                    dashboardTab === item.id ? 'bg-emerald-50 text-emerald-700' : 'text-muted-foreground hover:bg-slate-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}