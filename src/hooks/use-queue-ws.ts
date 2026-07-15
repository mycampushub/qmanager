// =============================================================================
// QueueFlow — Real-Time WebSocket Hook (Socket.io)
//
// Connects to the WebSocket mini-service (port 3003 via Caddy proxy).
// Clients join a tenant room and receive real-time events.
//
// Events received:
//   TICKET_CALLED    — a ticket was called to serve
//   TICKET_COMPLETED — a ticket was completed
//   TICKET_SKIPPED   — a ticket was skipped
//   TICKET_RECALLED  — a skipped ticket was recalled
//   TICKET_CREATED   — a new ticket joined a queue
//   TICKET_CANCELLED — a ticket was cancelled
//   QUEUE_UPDATE     — queue configuration changed
//
// Falls back to polling if WebSocket connection fails.
// =============================================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

export interface WSEvent {
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

export function useQueueWS(tenantId?: string, _authToken?: string): UseQueueWebSocketResult {
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const mountedRef = useRef(true);

  const clearLastEvent = useCallback(() => setLastEvent(null), []);

  // No-op: clients don't broadcast in this architecture
  const broadcast = useCallback((_tenantId: string, _event: string, _payload: Record<string, unknown>) => {
    // no-op — server-side API routes emit events
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    mountedRef.current = true;

    // Connect to WebSocket service via Caddy proxy
    const socket = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (!mountedRef.current) return;
      setConnected(true);
      // Join the tenant room
      socket.emit('join-tenant', { tenantId });
    });

    socket.on('disconnect', () => {
      if (!mountedRef.current) return;
      setConnected(false);
    });

    socket.on('connect_error', () => {
      // Silently handle — reconnection will be attempted automatically
      setConnected(false);
    });

    // Listen for broadcast events
    socket.on('event', (data: WSEvent) => {
      if (!mountedRef.current) return;
      // Filter: only process events for our tenant (or global events)
      if (data.tenantId && data.tenantId !== tenantId) return;
      setLastEvent(data);
    });

    // Cleanup on unmount or tenantId change
    return () => {
      mountedRef.current = false;
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('event');
      socket.emit('leave-tenant', { tenantId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tenantId]);

  return { connected, isConnected: connected, lastEvent, clearLastEvent, broadcast };
}

export const useQueueWebSocket = useQueueWS;