'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, BarChart3, Crown, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import type { AdminAnalytics } from './types';

export default function OverviewTab() {
  const adminToken = useAppStore((s) => s.adminToken);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (data.analytics) {
        setAnalytics(data.analytics);
      }
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const stats = analytics ?? { totalTenants: 0, activeToday: 0, totalTicketsServed: 0, totalRevenue: 0 };

  const statCards = [
    { label: 'Total Tenants', value: stats.totalTenants, icon: Building2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Active Today', value: stats.activeToday, icon: Users, color: 'text-amber-600 bg-amber-50' },
    { label: 'Total Tickets Served', value: stats.totalTicketsServed.toLocaleString(), icon: BarChart3, color: 'text-teal-600 bg-teal-50' },
    { label: 'Total Revenue', value: `৳${(stats.totalRevenue / 100).toLocaleString()}`, icon: Crown, color: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Platform Overview</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${s.color}`}>
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-2xl font-bold">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}