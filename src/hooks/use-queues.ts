// =============================================================================
// QueueFlow — Shared Hook for Fetching Tenant Queues
//
// Consolidates 3 different queue-fetching patterns used across:
//   - QueuesTab (receives via props from PUT /api/tenants)
//   - CountersTab (own fetch from PUT /api/tenants)
//   - BreaksTab (own fetch from PUT /api/tenants)
//   - StaffTab (own fetch from GET /api/queues)
//
// Usage: const { queues, loading, refetch } = useQueues(tenantId, authToken);
// =============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Queue } from '@/lib/types';

export function useQueues(tenantId: string | undefined, authToken: string | null) {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchQueues = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        const d = await res.json();
        const list = Array.isArray(d.tenant?.queues) ? d.tenant.queues : [];
        setQueues(list as Queue[]);
      }
    } catch {
      // silent — component manages its own error state
    } finally {
      setLoading(false);
    }
  }, [tenantId, authToken]);

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  return { queues, loading, refetch: fetchQueues };
}