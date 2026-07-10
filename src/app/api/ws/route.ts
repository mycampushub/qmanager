// =============================================================================
// QueueFlow — WebSocket Upgrade Route
// Route: /api/ws
//
// Upgrades HTTP to WebSocket and connects to the QueueWebSocket Durable Object.
// Replaces: mini-services/queue-ws/index.ts (Socket.IO server)
// =============================================================================

import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // In CF Workers, the Durable Object handles WebSocket directly.
  // This route provides a Next.js-compatible endpoint that the client can connect to.
  // The actual WebSocket upgrade happens at the Workers layer.
  //
  // For opennextjs-cloudflare, WebSocket routes are handled by the DO directly.
  // The client hook (use-queue-ws.ts) connects to /ws which routes to the DO.

  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket connection', { status: 426 });
  }

  // In a pure CF Workers deployment, this would be handled by the worker's
  // fetch handler which routes /ws to the Durable Object.
  // For Next.js compatibility, we return a 200 indicating the endpoint exists.
  return new Response('WebSocket endpoint. Connect with ws:// protocol.', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}