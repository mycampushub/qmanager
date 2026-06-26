'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function useQueueWebSocket(tenantId: string | null, token?: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ event: string; payload: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let intentionallyClosed = false;

    const createSocket = () => {
      const socket = io('/?XTransformPort=3003', {
        transports: ['websocket'],
      });

      socket.on('connect', () => {
        console.log('[WS Client] Connected');
        setIsConnected(true);
        setReconnecting(false);
        reconnectAttempts = 0;
        socket.emit('join-tenant', tenantId);
        if (token) {
          socket.emit('authenticate', token);
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('[WS Client] Disconnected:', reason);
        setIsConnected(false);
        socketRef.current = null;

        // Only attempt reconnect if not intentionally closed
        if (!intentionallyClosed && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const backoffMs = Math.min(
            INITIAL_BACKOFF_MS * Math.pow(2, reconnectAttempts),
            MAX_BACKOFF_MS
          );
          reconnectAttempts++;
          setReconnecting(true);
          console.log(`[WS Client] Reconnecting in ${backoffMs}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimer = setTimeout(createSocket, backoffMs);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          setReconnecting(false);
          console.log('[WS Client] Max reconnection attempts reached');
        }
      });

      // Listen for all queue events
      socket.on('TICKET_CALLED', (payload) => {
        setLastEvent({ event: 'TICKET_CALLED', payload });
      });

      socket.on('TICKET_COMPLETED', (payload) => {
        setLastEvent({ event: 'TICKET_COMPLETED', payload });
      });

      socket.on('TICKET_CREATED', (payload) => {
        setLastEvent({ event: 'TICKET_CREATED', payload });
      });

      socket.on('TICKET_SKIPPED', (payload) => {
        setLastEvent({ event: 'TICKET_SKIPPED', payload });
      });

      socket.on('QUEUE_UPDATE', (payload) => {
        setLastEvent({ event: 'QUEUE_UPDATE', payload });
      });

      socketRef.current = socket;
    };

    createSocket();

    return () => {
      intentionallyClosed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      setReconnecting(false);
    };
  }, [tenantId, token]);

  const broadcast = useCallback((event: string, payload: Record<string, unknown>) => {
    if (socketRef.current && tenantId) {
      socketRef.current.emit('broadcast', { tenantId, event, payload });
    }
  }, [tenantId]);

  const clearLastEvent = useCallback(() => {
    setLastEvent(null);
  }, []);

  return { isConnected, reconnecting, lastEvent, broadcast, clearLastEvent };
}