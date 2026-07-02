// =============================================================================
// QueueFlow — WebSocket Client Hook (Cloudflare Durable Objects compatible)
// Uses native WebSocket with JSON protocol.
// =============================================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';

interface WSEvent {
  type: string;
  event?: string;
  tenantId?: string;
  payload?: Record<string, unknown>;
}

interface UseQueueWebSocketResult {
  connected: boolean;
  isConnected: boolean;
  lastEvent: WSEvent | null;
  clearLastEvent: () => void;
  broadcast: (tenantId: string, event: string, payload: Record<string, unknown>) => void;
}

const MAX_RECONNECT = 10;

export function useQueueWS(tenantId?: string, authToken?: string): UseQueueWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const storeAuthToken = useAppStore((s) => s.authToken);
  const effectiveToken = authToken || storeAuthToken;

  const clearLastEvent = useCallback(() => setLastEvent(null), []);

  useEffect(() => {
    function scheduleReconnect() {
      if (reconnectAttempts.current >= MAX_RECONNECT) return;
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;
      reconnectTimeout.current = setTimeout(doConnect, delay);
    }

    function doConnect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/?XTransformPort=3003`);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          reconnectAttempts.current = 0;
          // Subscribe to tenant updates
          if (tenantId) {
            ws.send(JSON.stringify({ action: 'subscribe', tenantId }));
          }
        };
        ws.onmessage = (e) => {
          try {
            const event: WSEvent = JSON.parse(e.data);
            setLastEvent(event);
          } catch {
            /* ignore malformed messages */
          }
        };
        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          scheduleReconnect();
        };
        ws.onerror = () => ws.close();
      } catch {
        scheduleReconnect();
      }
    }

    if (effectiveToken) {
      doConnect();
    } else {
      wsRef.current?.close();
    }

    return () => {
      wsRef.current?.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [effectiveToken, tenantId]);

  const broadcast = useCallback((tid: string, event: string, payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'broadcast', tenantId: tid, event, payload }));
    }
  }, []);

  return { connected, isConnected: connected, lastEvent, clearLastEvent, broadcast };
}

// Alias for backward compatibility
export const useQueueWebSocket = useQueueWS;