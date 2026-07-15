// =============================================================================
// QueueFlow — Server-Side Event Notification
//
// FREE PLAN (current):
//   No-op. API routes call this, but it does nothing.
//   Clients learn about changes via adaptive polling.
//   The acting client gets immediate feedback via pushEvent() in the hook.
//
// PAID PLAN (future — uncomment DO section below):
//   Notifies the Durable Object to broadcast SSE events to all connected clients.
//   Cost: 1 DO request per event = ~$0.68/month for 100k tickets/day.
// =============================================================================

/**
 * Notify connected clients about a queue event.
 *
 * On the free plan, this is a no-op — clients use adaptive polling.
 * On the paid plan (with Durable Objects), this notifies the DO to push
 * the event via SSE to all connected clients for that tenant.
 *
 * This is fire-and-forget: errors are logged but never thrown.
 * API routes call this AFTER the database transaction succeeds,
 * so the event notification failure never affects the operation.
 */
export async function notifyEvent(
  _tenantId: string,
  _event: string,
  _payload: Record<string, unknown>
): Promise<void> {
  // ─── FREE PLAN: No-op ────────────────────────────────────────────────
  // Clients poll /api/tenants/[id]/poll adaptively (10s visible, 30s hidden).
  // The acting client uses pushEvent() for immediate feedback from API responses.
  return;

  // =============================================================================
  // PAID PLAN — Uncomment below and ensure wrangler.toml has the DO binding
  // =============================================================================
  /*
  try {
    const { env } = await getCloudflareContext({ async: true });
    const id = env.QUEUE_EVENTS.idFromName(_tenantId);
    const stub = env.QUEUE_EVENTS.get(id);

    await stub.fetch('http://internal/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: _event,
        tenantId: _tenantId,
        payload: _payload,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    console.error(
      `[SSE notify] Failed to notify DO for ${_event} on tenant ${_tenantId}:`,
      err instanceof Error ? err.message : err
    );
  }
  */
}