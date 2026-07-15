// =============================================================================
// QueueFlow — Unified Real-Time Events Hook
//
// Attempts SSE (Server-Sent Events) first for instant push notifications.
// Falls back to adaptive polling when SSE is unavailable (Cloudflare free plan).
//
// Architecture:
//   Paid plan  -> Durable Object holds SSE connections, pushes events instantly
//   Free plan  -> Client polls /api/tenants/[id]/poll with adaptive intervals
//
// Usage:
//   const { lastEvent, clearLastEvent, pushEvent, mode } = useQueueEvents(tenantId)
// =============================================================================

'use client';

import { useEffect, useRef, useReducer, useCallback } from 'react';

// ─── Event Types ──────────────────────────────────────────────────────────────

export interface QueueEvent {
  type: string;
  tenantId?: string;
  queueId?: string;
  payload?: Record<string, unknown>;
}

export type EventMode = 'sse' | 'polling' | 'idle';

interface UseQueueEventsOptions {
  /** Polling interval in ms (default: 10000, slower when tab hidden) */
  pollInterval?: number;
}

interface UseQueueEventsResult {
  lastEvent: QueueEvent | null;
  clearLastEvent: () => void;
  pushEvent: (event: QueueEvent) => void;
  mode: EventMode;
}

// ─── State Reducer (avoids direct setState in effects) ────────────────────────

interface HookState {
  lastEvent: QueueEvent | null;
  mode: EventMode;
}

type HookAction =
  | { type: 'SET_EVENT'; event: QueueEvent | null }
  | { type: 'SET_MODE'; mode: EventMode };

function hookReducer(state: HookState, action: HookAction): HookState {
  switch (action.type) {
    case 'SET_EVENT':
      return { ...state, lastEvent: action.event };
    case 'SET_MODE':
      return { ...state, mode: action.mode };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PollQueueState {
  id: string;
  now_serving_serial: number;
  current_serial: number;
}

function computeStateHash(queues: PollQueueState[]): string {
  if (!queues.length) return '';
  const sorted = [...queues].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map(q => `${q.id}:${q.now_serving_serial}:${q.current_serial}`).join('|');
}

function usePageVisible() {
  const [visible, setVisible] = useReducer((p: boolean) => !p, true);
  useEffect(() => {
    const handler = () => setVisible();
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return visible;
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

export function useQueueEvents(
  tenantId?: string,
  options?: UseQueueEventsOptions
): UseQueueEventsResult {
  const [state, dispatch] = useReducer(hookReducer, {
    lastEvent: null,
    mode: 'idle' as EventMode,
  });

  const mountedRef = useRef(true);
  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastHashRef = useRef<string>('');
  const pageVisible = usePageVisible();

  const clearLastEvent = useCallback(() => dispatch({ type: 'SET_EVENT', event: null }), []);

  const emit = useCallback((event: QueueEvent) => {
    if (!mountedRef.current) return;
    dispatch({ type: 'SET_EVENT', event });
  }, []);

  const pushEvent = useCallback((event: QueueEvent) => {
    emit(event);
  }, [emit]);

  // ─── SSE Connection ────────────────────────────────────────────────────

  const openSSE = useCallback((tid: string) => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    try {
      const es = new EventSource(`/api/tenants/${tid}/events`);

      es.onmessage = (e) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data) as QueueEvent;
          if (data.type === 'SSE_UNAVAILABLE') {
            es.close();
            esRef.current = null;
            dispatch({ type: 'SET_MODE', mode: 'polling' });
            return;
          }
          emit(data);
        } catch {
          // Ignore malformed
        }
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        es.close();
        esRef.current = null;
        dispatch({ type: 'SET_MODE', mode: 'polling' });
      };

      esRef.current = es;
      dispatch({ type: 'SET_MODE', mode: 'sse' });
    } catch {
      dispatch({ type: 'SET_MODE', mode: 'polling' });
    }
  }, [emit]);

  // ─── Polling ───────────────────────────────────────────────────────────

  const doPoll = useCallback(async (tid: string) => {
    if (!mountedRef.current) return;
    try {
      const res = await fetch(`/api/tenants/${tid}/poll`);
      if (!res.ok) return;
      const data = await res.json();
      const queues: PollQueueState[] = data.queues ?? [];
      const hash = computeStateHash(queues);
      if (lastHashRef.current && hash !== lastHashRef.current) {
        emit({ type: 'QUEUE_UPDATE', tenantId: tid });
      }
      lastHashRef.current = hash;
    } catch {
      // Silently retry
    }
  }, [emit]);

  const startPolling = useCallback((tid: string, baseInterval: number) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = undefined;
    }

    const schedule = () => {
      if (!mountedRef.current) return;
      const interval = pageVisible ? baseInterval : Math.min(baseInterval * 3, 60000);
      pollTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        doPoll(tid).finally(schedule);
      }, interval);
    };

    doPoll(tid).finally(schedule);
  }, [doPoll, pageVisible]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = undefined;
    }
  }, []);

  // ─── Lifecycle: open SSE on tenantId change ───────────────────────────

  useEffect(() => {
    if (!tenantId) {
      dispatch({ type: 'SET_MODE', mode: 'idle' });
      return;
    }

    mountedRef.current = true;
    lastHashRef.current = '';
    stopPolling();
    openSSE(tenantId);

    return () => {
      mountedRef.current = false;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      stopPolling();
      lastHashRef.current = '';
    };
  }, [tenantId]);

  // ─── Start/stop polling when mode changes ──────────────────────────────

  useEffect(() => {
    if (!tenantId || state.mode !== 'polling') {
      stopPolling();
      return;
    }

    startPolling(tenantId, options?.pollInterval ?? 10000);
    return () => stopPolling();
  }, [state.mode, tenantId, options?.pollInterval, startPolling, stopPolling]);

  return { lastEvent: state.lastEvent, clearLastEvent, pushEvent, mode: state.mode };
}

export default useQueueEvents;