'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/stores/app-store';
import MarketingView from '@/components/views/MarketingView';
import JoinView from '@/components/views/JoinView';
import DashboardView from '@/components/views/DashboardView';
import DisplayView from '@/components/views/DisplayView';
import PlatformAdminView from '@/components/views/PlatformAdminView';
import MasterTenantView from '@/components/views/MasterTenantView';
import { RegistrationDialog } from '@/components/RegistrationDialog';
import { Toaster } from 'sonner';
import ErrorBoundary from '@/components/ErrorBoundary';

// Lightweight JWT decode (no signature verification - just for UI restore)
function decodeJwtPayload(token: string): { exp?: number; [key: string]: unknown } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
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

  // Handle URL params: ?tenant=xxx redirects to join view, ?display=xxx opens display
  useEffect(() => {
    const tenantId = searchParams.get('tenant');
    const displayId = searchParams.get('display');

    if (tenantId) {
      useAppStore.getState().setCurrentView('join');
      useAppStore.getState().setJoinTenantId(tenantId);
    } else if (displayId) {
      useAppStore.getState().setCurrentView('display');
      useAppStore.getState().setDisplayTenantId(displayId);
    }
  }, [searchParams]);

  // Listen for reduced motion preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Restore auth state from localStorage on mount
  useEffect(() => {
    // Restore staff auth
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


  }, []);

  const viewContent = (
    <div id="main-content">
      {currentView === 'marketing' && <MarketingView />}
      {currentView === 'join' && <JoinView />}
      {currentView === 'dashboard' && <DashboardView />}
      {currentView === 'display' && <DisplayView />}
      {currentView === 'admin' && <PlatformAdminView />}
      {currentView === 'masterTenant' && <MasterTenantView />}
    </div>
  );

  return (
    <>
      <Toaster position="top-center" richColors closeButton />
      <RegistrationDialog />
      {/* H1: Skip to content link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-emerald-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-md">
        Skip to main content
      </a>
      <ErrorBoundary>
        {/* H8: Reduced motion support */}
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