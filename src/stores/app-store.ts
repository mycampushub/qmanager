import { create } from 'zustand';
import type { AppView, StaffUser, Ticket, Tenant } from '@/lib/types';

interface AppState {
  // Navigation
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  // Auth
  authUser: StaffUser | null;
  authToken: string | null;
  setAuth: (user: StaffUser, token: string, csrfToken?: string) => void;
  logout: () => void;

  // Platform Admin Auth
  adminUser: { id: string; email: string; name: string } | null;
  adminToken: string | null;
  setAdminAuth: (user: { id: string; email: string; name: string }, token: string) => void;
  adminLogout: () => void;

  // Dashboard sub-views
  dashboardTab: 'agent' | 'manager' | 'analytics' | 'branding' | 'wallet' | 'queues' | 'staff' | 'service-windows' | 'appointments' | 'feedback' | 'webhooks' | 'settings';
  setDashboardTab: (tab: AppState['dashboardTab']) => void;

  // Selected tenant (for admin/master tenant views)
  selectedTenantId: string | null;
  setSelectedTenantId: (id: string | null) => void;

  // Join page state
  joinTenantId: string | null;
  setJoinTenantId: (id: string | null) => void;
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

  // Registration dialog
  registrationOpen: boolean;
  setRegistrationOpen: (v: boolean) => void;
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
  },

  // Dashboard tabs
  dashboardTab: 'agent',
  setDashboardTab: (tab) => set({ dashboardTab: tab }),

  // Selected tenant
  selectedTenantId: null,
  setSelectedTenantId: (id) => set({ selectedTenantId: id }),

  // Join page
  joinTenantId: null,
  setJoinTenantId: (id) => set({ joinTenantId: id }),
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

  // Registration dialog
  registrationOpen: false,
  setRegistrationOpen: (v) => set({ registrationOpen: v }),
}));