'use client';

import dynamic from 'next/dynamic';
import { useAppStore } from '@/stores/app-store';

const DashboardView = dynamic(
  () => import('@/components/views/DashboardView'),
  { ssr: false }
);
const PlatformAdminView = dynamic(
  () => import('@/components/views/PlatformAdminView'),
  { ssr: false }
);
const MasterTenantView = dynamic(
  () => import('@/components/views/MasterTenantView'),
  { ssr: false }
);

export default function DashboardPage() {
  const adminUser = useAppStore((s) => s.adminUser);
  const mtUser = useAppStore((s) => s.mtUser);

  // Platform admin
  if (adminUser) {
    return <PlatformAdminView />;
  }

  // Master tenant (franchise) admin
  if (mtUser) {
    return <MasterTenantView />;
  }

  // Staff / Manager / Agent (or unauthenticated — will show LoginScreen)
  return <DashboardView />;
}