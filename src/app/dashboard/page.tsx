'use client';

import { Suspense } from 'react';
import DashboardView from '@/components/views/DashboardView';

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardView />
    </Suspense>
  );
}