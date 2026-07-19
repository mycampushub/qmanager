// =============================================================================
// QueueFlow — Real-Time WebSocket Hook (DEPRECATED)
//
// ⚠️  DEPRECATED — WebSocket mini-service has been replaced by SSE + adaptive
//     polling via use-queue-events.ts. This file is kept for reference only.
//
// To restore WebSocket support:
//   1. Start the WebSocket mini-service: cd mini-services/queue-ws && bun run dev
//   2. Uncomment the code below
//   3. Add "socket.io-client" back to package.json dependencies
// =============================================================================

// NOTE: This module is deprecated. Use useQueueEvents from use-queue-events.ts instead.

/** @deprecated Use useQueueEvents from @/hooks/use-queue-events instead */
export interface WSEvent {
  type: string;
  event?: string;
  tenantId?: string;
  payload?: Record<string, unknown>;
}

/** @deprecated No-op stub. Use useQueueEvents from @/hooks/use-queue-events instead */
export function useQueueWS(_tenantId?: string, _authToken?: string) {
  return {
    connected: false,
    isConnected: false,
    lastEvent: null,
    clearLastEvent: () => {},
    broadcast: () => {},
  };
}

/** @deprecated No-op stub */
export const useQueueWebSocket = useQueueWS;