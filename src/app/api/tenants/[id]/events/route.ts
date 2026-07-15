// =============================================================================
// QueueFlow — SSE Events Endpoint
//
// FREE PLAN (current):
//   Returns SSE_UNAVAILABLE message so the client hook falls back to polling.
//   No server-side push — clients poll /api/tenants/[id]/poll adaptively.
//
// PAID PLAN (future — uncomment DURABLE OBJECT section below):
//   Forwards the request to a Durable Object which holds SSE connections
//   and pushes events in real-time. Cost: ~$0.68/month for 100k tickets/day.
//
// To activate:
//   1. Upgrade to Cloudflare Workers Paid ($5/month)
//   2. Add Durable Object binding in wrangler.toml:
//      [[durable_objects.bindings]]
//      name = "QUEUE_EVENTS"
//      class_name = "QueueEventsDO"
//      script_name = "queue-events-do"
//   3. Create a separate worker file with the QueueEventsDO class
//   4. Replace this GET handler with GET_PAID (search "PAID PLAN HANDLER" below)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';

// ─── FREE PLAN: Signal SSE unavailability ────────────────────────────────────
// The client hook receives this, closes the EventSource, and switches to
// adaptive polling. This adds zero cost — no Durable Object requests.
// ------------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params;

  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
  }

  // Return a valid SSE stream that signals unavailability.
  // The client hook detects this and falls back to adaptive polling.
  const body = `data: ${JSON.stringify({ type: 'SSE_UNAVAILABLE' })}\n\n`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

// =============================================================================
// PAID PLAN — DURABLE OBJECT IMPLEMENTATION
//
// The code below is REFERENCE ONLY. It is commented out line-by-line to avoid
// TypeScript parsing issues with nested block comments.
//
// To use: create a separate worker file (queue-events-do.ts) with the DO class
// and deploy it. Then replace the GET handler above with GET_PAID.
//
// Cost for 100k tickets/day:
//   - Event notifications: 100k/day x $0.15/M = $0.015/day
//   - SSE connection opens: ~50k/day x $0.15/M = $0.008/day
//   - Total: ~$0.68/month
// =============================================================================

// PAID PLAN DO CLASS (create as separate worker: queue-events-do.ts):
//
// interface QueueEventMessage {
//   type: string;
//   tenantId: string;
//   queueId?: string;
//   payload?: Record<string, unknown>;
//   timestamp: number;
// }
//
// export class QueueEventsDO implements DurableObject {
//   private state: DurableObjectState;
//   private sessions: Set<WritableStreamDefaultController<Uint8Array>> = new Set();
//
//   constructor(ctx: DurableObjectState, _env: unknown) {
//     this.state = ctx;
//   }
//
//   async fetch(request: Request): Promise<Response> {
//     const url = new URL(request.url);
//
//     // POST /notify — API routes call this to push events to all SSE clients
//     if (request.method === 'POST' && url.pathname === '/notify') {
//       const event: QueueEventMessage = await request.json();
//       this.broadcast(event);
//       return new Response(JSON.stringify({ ok: true }), {
//         headers: { 'Content-Type': 'application/json' },
//       });
//     }
//
//     // GET — SSE connection from client
//     if (request.method === 'GET') {
//       const { readable, writable } = new TransformStream();
//       const writer = writable.getWriter();
//       const encoder = new TextEncoder();
//
//       // Send initial confirmation
//       writer.write(encoder.encode(
//         `data: ${JSON.stringify({ type: 'SSE_CONNECTED', tenantId: this.state.id.toString() })}\n\n`
//       ));
//
//       // Store writer for later broadcasting
//       this.sessions.add(writer);
//
//       // Cleanup on abort signal
//       const abortHandler = () => {
//         this.sessions.delete(writer);
//         try { writer.close(); } catch { _unused(writer) }
//       };
//       request.signal.addEventListener('abort', abortHandler, { once: true });
//
//       // Keep-alive ping every 25 seconds to prevent proxy timeout
//       const keepalive = setInterval(() => {
//         try {
//           writer.write(encoder.encode(': keepalive\n\n'));
//         } catch {
//           clearInterval(keepalive);
//           this.sessions.delete(writer);
//           try { writer.close(); } catch { _unused(writer) }
//         }
//       }, 25000);
//
//       return new Response(readable, {
//         headers: {
//           'Content-Type': 'text/event-stream',
//           'Cache-Control': 'no-cache, no-transform',
//           'Connection': 'keep-alive',
//           'Access-Control-Allow-Origin': '*',
//         },
//       });
//     }
//
//     return new Response('Not Found', { status: 404 });
//   }
//
//   private broadcast(event: QueueEventMessage): void {
//     const data = `data: ${JSON.stringify(event)}\n\n`;
//     const encoder = new TextEncoder();
//     const encoded = encoder.encode(data);
//     const dead: WritableStreamDefaultController<Uint8Array>[] = [];
//
//     for (const session of this.sessions) {
//       try {
//         session.write(encoded);
//       } catch {
//         dead.push(session);
//       }
//     }
//
//     // Clean up dead sessions
//     for (const session of dead) {
//       this.sessions.delete(session);
//       try { session.close(); } catch { _unused(session) }
//     }
//   }
// }
//
// PAID PLAN HANDLER (replaces the GET handler above):
//
// import { getCloudflareContext } from '@opennextjs/cloudflare';
//
// export async function GET_PAID(
//   request: NextRequest,
//   { params }: { params: Promise<{ id: string }> }
// ): Promise<Response> {
//   const { id: tenantId } = await params;
//   if (!tenantId) {
//     return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
//   }
//   const { env } = await getCloudflareContext({ async: true });
//   const id = env.QUEUE_EVENTS.idFromName(tenantId);
//   const stub = env.QUEUE_EVENTS.get(id);
//   return stub.fetch(request);
// }
//
// PAID PLAN — event-notify.ts should use this instead of no-op:
//
// export async function notifyDO(
//   tenantId: string,
//   event: string,
//   payload: Record<string, unknown>
// ): Promise<void> {
//   try {
//     const { env } = await getCloudflareContext({ async: true });
//     const id = env.QUEUE_EVENTS.idFromName(tenantId);
//     const stub = env.QUEUE_EVENTS.get(id);
//     await stub.fetch('http://internal/notify', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ type: event, tenantId, payload, timestamp: Date.now() }),
//       signal: AbortSignal.timeout(2000),
//     });
//   } catch (err) {
//     console.error('[SSE notify] Failed:', err instanceof Error ? err.message : err);
//   }
// }

// Suppress unused variable warnings for the reference code above
function _unused(_v: unknown): void { /* no-op */ }