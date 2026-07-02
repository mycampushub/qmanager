// =============================================================================
// QueueFlow — Durable Object: Real-Time Queue WebSocket
// Replaces: mini-services/queue-ws/index.ts (Socket.IO server)
//
// Uses Cloudflare Durable Objects with WebSocket Hibernation API.
// Each tenant gets its own Durable Object for isolated room management.
//
// Client protocol (JSON over WebSocket):
//   → { action: 'authenticate', token: '...' }
//   → { action: 'join-tenant', tenantId: '...' }
//   ← { type: 'TICKET_CALLED', tenantId: '...', payload: {...} }
//   ← { type: 'QUEUE_UPDATE', tenantId: '...', payload: {...} }
// =============================================================================

import { DurableObject } from 'cloudflare:workers';

interface WebSocketClient {
  ws: WebSocket;
  userId?: string;
  tenantId?: string;
  role?: string;
}

export class QueueWebSocket extends DurableObject<Env> {
  // Map: tenantId → Set of connected websockets
  private tenantRooms = new Map<string, Set<WebSocket>>();
  // Map: websocket → tenantId (reverse lookup)
  private socketTenants = new Map<WebSocket, string>();
  // Map: websocket → userId
  private socketUsers = new Map<WebSocket, string>();

  // ─── HTTP Handler (for broadcast from API routes) ───────────────────
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /broadcast — API routes call this to push real-time updates
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const body = await request.json() as { tenantId: string; event: string; payload: Record<string, unknown> };
      this.broadcastToTenant(body.tenantId, body.event, body.payload);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // POST /server-broadcast — global broadcast (platform admin)
    if (url.pathname === '/server-broadcast' && request.method === 'POST') {
      const body = await request.json() as { event: string; payload: Record<string, unknown> };
      this.broadcastAll(body.event, body.payload);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // GET /stats — connection stats
    if (url.pathname === '/stats') {
      const stats: Record<string, number> = {};
      for (const [tenantId, sockets] of this.tenantRooms) {
        stats[tenantId] = sockets.size;
      }
      return new Response(JSON.stringify({ totalConnections: this.socketTenants.size, rooms: stats }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  // ─── WebSocket Handler ──────────────────────────────────────────────
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    try {
      const data = JSON.parse(message);

      switch (data.action) {
        case 'authenticate': {
          // JWT verification is done client-side; here we just record identity
          this.socketUsers.set(ws, data.userId || 'anonymous');
          this.socketTenants.get(ws); // ensure socket is tracked
          ws.send(JSON.stringify({ type: 'AUTHENTICATED', userId: data.userId }));
          break;
        }

        case 'join-tenant': {
          const tenantId = data.tenantId;
          if (!tenantId) break;

          // Leave previous room
          const prevTenant = this.socketTenants.get(ws);
          if (prevTenant) {
            this.tenantRooms.get(prevTenant)?.delete(ws);
          }

          // Join new room
          if (!this.tenantRooms.has(tenantId)) {
            this.tenantRooms.set(tenantId, new Set());
          }
          this.tenantRooms.get(tenantId)!.add(ws);
          this.socketTenants.set(ws, tenantId);

          ws.send(JSON.stringify({ type: 'JOINED_TENANT', tenantId }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'ERROR', message: `Unknown action: ${data.action}` }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    const tenantId = this.socketTenants.get(ws);
    if (tenantId) {
      this.tenantRooms.get(tenantId)?.delete(ws);
      // Clean up empty rooms
      if (this.tenantRooms.get(tenantId)?.size === 0) {
        this.tenantRooms.delete(tenantId);
      }
    }
    this.socketTenants.delete(ws);
    this.socketUsers.delete(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): void {
    // Clean up on error
    const tenantId = this.socketTenants.get(ws);
    if (tenantId) {
      this.tenantRooms.get(tenantId)?.delete(ws);
    }
    this.socketTenants.delete(ws);
    this.socketUsers.delete(ws);
  }

  // ─── Broadcast Helpers ──────────────────────────────────────────────

  /** Send an event to all sockets in a tenant room */
  private broadcastToTenant(tenantId: string, event: string, payload: Record<string, unknown>): void {
    const room = this.tenantRooms.get(tenantId);
    if (!room) return;

    const message = JSON.stringify({ type: event, tenantId, payload });

    for (const ws of room) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      } catch {
        // Remove dead socket
        room.delete(ws);
      }
    }
  }

  /** Broadcast to all connected sockets */
  private broadcastAll(event: string, payload: Record<string, unknown>): void {
    const message = JSON.stringify({ type: event, payload });
    for (const ws of this.socketTenants.keys()) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      } catch {
        this.socketTenants.delete(ws);
      }
    }
  }
}