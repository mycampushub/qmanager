import { create } from 'zustand';
import type { AppView, StaffUser, Ticket, Tenant, Location } from '@/lib/types';

export interface MasterTenantAdminUser {
  id: string;
  email: string;
  name: string;
  masterTenantId: string;
  masterTenant: {
    id: string;
    corporateName: string;
    billingStatus: string;
  };
}

interface AppState {
  // Navigation
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  // Auth (staff/tenant manager)
  authUser: StaffUser | null;
  authToken: string | null;
  setAuth: (user: StaffUser, token: string, csrfToken?: string) => void;
  logout: () => void;

  // Platform Admin Auth
  adminUser: { id: string; email: string; name: string } | null;
  adminToken: string | null;
  setAdminAuth: (user: { id: string; email: string; name: string }, token: string) => void;
  adminLogout: () => void;

  // Master Tenant Admin Auth
  mtUser: MasterTenantAdminUser | null;
  mtToken: string | null;
  setMtAuth: (user: MasterTenantAdminUser, token: string) => void;
  mtLogout: () => void;

  // Dashboard sub-views
  dashboardTab: 'agent' | 'manager' | 'analytics' | 'branding' | 'wallet' | 'queues' | 'staff' | 'service-windows' | 'appointments' | 'feedback' | 'webhooks' | 'settings' | 'locations' | 'breaks' | 'counters';
  setDashboardTab: (tab: AppState['dashboardTab']) => void;

  // Selected tenant (for admin/master tenant views)
  selectedTenantId: string | null;
  setSelectedTenantId: (id: string | null) => void;

  // Selected location filter (for join page, display, agent view)
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;

  // Join page state
  joinTenantId: string | null;
  setJoinTenantId: (id: string | null) => void;
  joinQueueId: string | null;
  setJoinQueueId: (id: string | null) => void;
  activeTicket: Ticket | null;
  setActiveTicket: (ticket: Ticket | null) => void;
  myTickets: Ticket[];
  setMyTickets: (tickets: Ticket[]) => void;

  // TV Display
  displayTenantId: string | null;
  setDisplayTenantId: (id: string | null) => void;

  // Tenant list (for display selection)
  tenants: Tenant[];
  setTenants: (tenants: Tenant[]) => void;

}

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  currentView: 'marketing',
  setCurrentView: (view) => set({ currentView: view }),

  // Auth
  authUser: null,
  authToken: null,
  setAuth: (user, token, csrfToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('qms_token', token);
      localStorage.setItem('qms_user', JSON.stringify(user));
      if (csrfToken) {
        localStorage.setItem('qms_csrf', csrfToken);
      }
    }
    set({ authUser: user, authToken: token });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('qms_token');
      localStorage.removeItem('qms_user');
    }
    set({ authUser: null, authToken: null, currentView: 'marketing' });
  },

  // Platform Admin Auth
  adminUser: null,
  adminToken: null,
  setAdminAuth: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('qms_admin_token', token);
      localStorage.setItem('qms_admin_user', JSON.stringify(user));
    }
    set({ adminUser: user, adminToken: token });
  },
  adminLogout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('qms_admin_token');
      localStorage.removeItem('qms_admin_user');
    }
    set({ adminUser: null, adminToken: null, currentView: 'marketing' });
    if (typeof window !== 'undefined' && window.location.pathname === '/dashboard') {
      window.location.href = '/';
    }
  },

  // Master Tenant Admin Auth
  mtUser: null,
  mtToken: null,
  setMtAuth: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('qms_mt_token', token);
      localStorage.setItem('qms_mt_user', JSON.stringify(user));
    }
    set({ mtUser: user, mtToken: token });
  },
  mtLogout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('qms_mt_token');
      localStorage.removeItem('qms_mt_user');
    }
    set({ mtUser: null, mtToken: null, currentView: 'marketing' });
    if (typeof window !== 'undefined' && window.location.pathname === '/dashboard') {
      window.location.href = '/';
    }
  },

  // Dashboard tabs
  dashboardTab: 'agent',
  setDashboardTab: (tab) => set({ dashboardTab: tab }),

  // Selected tenant
  selectedTenantId: null,
  setSelectedTenantId: (id) => set({ selectedTenantId: id }),

  // Selected location filter
  selectedLocationId: null,
  setSelectedLocationId: (id) => set({ selectedLocationId: id }),

  // Join page
  joinTenantId: null,
  setJoinTenantId: (id) => set({ joinTenantId: id }),
  joinQueueId: null,
  setJoinQueueId: (id) => set({ joinQueueId: id }),
  activeTicket: null,
  setActiveTicket: (ticket) => set({ activeTicket: ticket }),
  myTickets: [],
  setMyTickets: (tickets) => set({ myTickets: tickets }),

  // TV Display
  displayTenantId: null,
  setDisplayTenantId: (id) => set({ displayTenantId: id }),

  // Tenants
  tenants: [],
  setTenants: (tenants) => set({ tenants }),

}));
