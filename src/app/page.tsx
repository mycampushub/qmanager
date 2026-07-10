'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/stores/app-store';
import MarketingView from '@/components/views/MarketingView';
import JoinView from '@/components/views/JoinView';
import DisplayView from '@/components/views/DisplayView';
import PlatformAdminView from '@/components/views/PlatformAdminView';
import MasterTenantView from '@/components/views/MasterTenantView';
import { Toaster } from 'sonner';
import ErrorBoundary from '@/components/ErrorBoundary';

// Lightweight JWT decode (no signature verification - just for UI restore)
function decodeJwtPayload(token: string): { exp?: number; [key: string]: unknown } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Browser-compatible base64url decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const binaryStr = atob(padded);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload;
  } catch {
    return null;
  }
}

function getReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const currentView = useAppStore((s) => s.currentView);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getReducedMotion);

  const loadTicketFromUrl = useCallback(async (ticketId: string) => {
    try {
      const res = await fetch(`/api/tickets/status?ticketId=${ticketId}`);
      if (!res.ok) {
        console.warn('Failed to load ticket from URL param:', ticketId);
        return;
      }
      const data = await res.json();
      const t = data.ticket;
      if (t && t.id) {
        const store = useAppStore.getState();
        store.setJoinTenantId(t.tenantId || t.tenant_id);
        store.setActiveTicket({
          id: t.id,
          tenantId: t.tenantId || t.tenant_id,
          queueId: t.queueId || t.queue_id,
          serialNumber: t.serialNumber || t.serial_number,
          status: t.status,
          customerName: t.customerName || t.customer_name || '',
          customerPhone: t.customerPhone || t.customer_phone || null,
          deviceId: null,
          notes: null,
          createdAt: t.createdAt || t.created_at || '',
          servedAt: null,
          completedAt: null,
          cancelledAt: null,
          skippedAt: null,
          servedByAgent: null,
          skipCount: 0,
          _formattedSerial: t._formattedSerial,
          _peopleAhead: t._peopleAhead,
          _ewt: t._ewt,
          queue: t.queue,
        });
        store.setCurrentView('join');
      }
    } catch {
      console.warn('Failed to load ticket from URL param');
    }
  }, []);

  // Handle URL params: ?tenant=xxx, ?display=xxx, ?ticket=xxx
  useEffect(() => {
    const tenantId = searchParams.get('tenant');
    const displayId = searchParams.get('display');
    const ticketId = searchParams.get('ticket');

    if (ticketId && !tenantId) {
      loadTicketFromUrl(ticketId);
    } else if (tenantId) {
      useAppStore.getState().setCurrentView('join');
      useAppStore.getState().setJoinTenantId(tenantId);
    } else if (displayId) {
      useAppStore.getState().setCurrentView('display');
      useAppStore.getState().setDisplayTenantId(displayId);
    }
  }, [searchParams, loadTicketFromUrl]);

  // Listen for reduced motion preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Restore auth state from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('qms_token');
    const userStr = localStorage.getItem('qms_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        const payload = decodeJwtPayload(token);
        if (payload && payload.exp && (payload.exp as number) * 1000 > Date.now()) {
          useAppStore.getState().setAuth(user, token);
        } else {
          localStorage.removeItem('qms_token');
          localStorage.removeItem('qms_user');
        }
      } catch {
        localStorage.removeItem('qms_token');
        localStorage.removeItem('qms_user');
      }
    }

    // Restore admin auth
    const adminToken = localStorage.getItem('qms_admin_token');
    const adminUserStr = localStorage.getItem('qms_admin_user');
    if (adminToken && adminUserStr) {
      try {
        const adminUser = JSON.parse(adminUserStr);
        const payload = decodeJwtPayload(adminToken);
        if (payload && payload.exp && (payload.exp as number) * 1000 > Date.now()) {
          useAppStore.getState().setAdminAuth(adminUser, adminToken);
        } else {
          localStorage.removeItem('qms_admin_token');
          localStorage.removeItem('qms_admin_user');
        }
      } catch {
        localStorage.removeItem('qms_admin_token');
        localStorage.removeItem('qms_admin_user');
      }
    }

    // Restore master tenant admin auth
    const mtToken = localStorage.getItem('qms_mt_token');
    const mtUserStr = localStorage.getItem('qms_mt_user');
    if (mtToken && mtUserStr) {
      try {
        const mtUser = JSON.parse(mtUserStr);
        const payload = decodeJwtPayload(mtToken);
        if (payload && payload.exp && (payload.exp as number) * 1000 > Date.now()) {
          useAppStore.getState().setMtAuth(mtUser, mtToken);
        } else {
          localStorage.removeItem('qms_mt_token');
          localStorage.removeItem('qms_mt_user');
        }
      } catch {
        localStorage.removeItem('qms_mt_token');
        localStorage.removeItem('qms_mt_user');
      }
    }

    // Auto-navigate based on restored auth
    const state = useAppStore.getState();
    if (window.location.pathname !== '/dashboard') {
      if (state.adminUser) {
        state.setCurrentView('admin');
      } else if (state.mtUser) {
        state.setCurrentView('masterTenant');
      } else if (state.authUser) {
        window.location.href = '/dashboard';
      }
    }
  }, []);

  const viewContent = (
    <div id="main-content">
      {currentView === 'marketing' && <MarketingView />}
      {currentView === 'join' && <JoinView />}
      {currentView === 'display' && <DisplayView />}
      {currentView === 'admin' && <PlatformAdminView />}
      {currentView === 'masterTenant' && <MasterTenantView />}
    </div>
  );

  return (
    <>
      <Toaster position="top-center" richColors closeButton />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-emerald-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-md">
        Skip to main content
      </a>
      <ErrorBoundary>
        {prefersReducedMotion ? (
          <div className="min-h-screen">
            {viewContent}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="min-h-screen"
            >
              {viewContent}
            </motion.div>
          </AnimatePresence>
        )}
      </ErrorBoundary>
    </>
  );
}
