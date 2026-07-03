// =============================================================================
// QueueFlow — Queue Polling Hook (replaces WebSocket for free-plan CF Workers)
//
// Polls a lightweight endpoint to detect queue changes and emits events
// with the same interface as the previous WebSocket hook.
//
// Events emitted on change detection:
//   TICKET_CALLED   — now_serving_serial changed
//   TICKET_CREATED  — current_serial changed (new ticket joined)
//   QUEUE_UPDATE    — any other queue data change
// =============================================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface WSEvent {
  type: string;
  event?: string;
  tenantId?: string;
  payload?: Record<string, unknown>;
}

interface QueueSnapshot {
  id: string;
  now_serving_serial: number;
  current_serial: number;
}

interface UseQueueWebSocketResult {
  connected: boolean;
  isConnected: boolean;
  lastEvent: WSEvent | null;
  clearLastEvent: () => void;
  broadcast: (tenantId: string, event: string, payload: Record<string, unknown>) => void;
}

export function useQueueWS(tenantId?: string, authToken?: string): UseQueueWebSocketResult {
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const prevSnapRef = useRef<string>(''); // JSON-stringified snapshot for comparison
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const clearLastEvent = useCallback(() => setLastEvent(null), []);

  // No-op: polling cannot broadcast
  const broadcast = useCallback((_tenantId: string, _event: string, _payload: Record<string, unknown>) => {
    // no-op — polling is receive-only
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    mountedRef.current = true;

    async function poll() {
      if (!mountedRef.current) return;
      try {
        const headers: Record<string, string> = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const res = await fetch(`/api/tenants/${tenantId}/poll`, { headers, signal: AbortSignal.timeout(8000) });
        if (!res.ok || !mountedRef.current) return;

        const data = await res.json() as { queues: QueueSnapshot[] };
        const snapshot = JSON.stringify(data.queues);

        // First poll — just store, don't emit
        if (!prevSnapRef.current) {
          prevSnapRef.current = snapshot;
          return;
        }

        if (snapshot !== prevSnapRef.current) {
          const prev: QueueSnapshot[] = JSON.parse(prevSnapRef.current);
          const curr: QueueSnapshot[] = data.queues;

          // Compare to detect what changed
          for (const c of curr) {
            const p = prev.find((q) => q.id === c.id);
            if (!p) continue;

            if (c.now_serving_serial !== p.now_serving_serial) {
              // A ticket was called — highest priority event
              if (mountedRef.current) {
                setLastEvent({
                  type: 'TICKET_CALLED',
                  event: 'TICKET_CALLED',
                  tenantId,
                  payload: {
                    queueId: c.id,
                    serialNumber: c.now_serving_serial,
                    prevSerial: p.now_serving_serial,
                  },
                });
              }
              prevSnapRef.current = snapshot;
              return; // emit one event per poll cycle
            }

            if (c.current_serial !== p.current_serial) {
              // New ticket joined queue
              if (mountedRef.current) {
                setLastEvent({
                  type: 'TICKET_CREATED',
                  event: 'TICKET_CREATED',
                  tenantId,
                  payload: { queueId: c.id, serialNumber: c.current_serial },
                });
              }
              prevSnapRef.current = snapshot;
              return;
            }
          }

          // Generic update (queue added/removed, etc.)
          if (mountedRef.current) {
            setLastEvent({ type: 'QUEUE_UPDATE', event: 'QUEUE_UPDATE', tenantId, payload: {} });
          }
          prevSnapRef.current = snapshot;
        }
      } catch {
        // Network error — silently retry next interval
      }
    }

    // Poll immediately, then every 3 seconds
    poll();
    timerRef.current = setInterval(poll, 3000);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tenantId, authToken]);

  return { connected: true, isConnected: true, lastEvent, clearLastEvent, broadcast };
}

export const useQueueWebSocket = useQueueWS;