// =============================================================================
// QueueFlow — Event Emitter (Backward-Compatible Wrapper)
//
// Previously: Sent events to WebSocket mini-service (port 3003).
// Now: Delegates to event-notify.ts (no-op on free plan, DO notify on paid).
//
// All existing API routes can keep importing emitWSEvent without changes.
// The WebSocket mini-service is no longer needed and can be stopped.
// =============================================================================

import { notifyEvent } from './event-notify';

/**
 * Emit an event for a tenant. Backward-compatible with the old ws-emit API.
 *
 * On free plan: no-op (clients poll).
 * On paid plan: notifies Durable Object for SSE broadcast.
 *
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function emitWSEvent(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  return notifyEvent(tenantId, event, payload);
}