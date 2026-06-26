import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// ─── Inline JWT verification (self-contained mini-service) ───
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

interface JwtPayload {
  userId: string;
  tenantId?: string;
  role: string;
  type: string;
}

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Map: tenantId -> Set of connected socket ids
const tenantRooms = new Map<string, Set<string>>();
// Map: socketId -> tenantId
const socketTenants = new Map<string, string>();
// Map: socketId -> userId
const socketUsers = new Map<string, string>();

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // C7: Authenticate on connection via token
  socket.on('authenticate', (token: string, callback?: (success: boolean, msg?: string) => void) => {
    try {
      const payload = verifyToken(token);
      if (!payload) {
        console.log(`[WS] Auth failed for ${socket.id}: invalid token`);
        callback?.(false, 'Invalid or expired token');
        socket.disconnect();
        return;
      }
      socketUsers.set(socket.id, payload.userId);
      console.log(`[WS] Authenticated ${socket.id} as ${payload.role} (${payload.userId})`);
      callback?.(true);
    } catch {
      callback?.(false, 'Authentication error');
      socket.disconnect();
    }
  });

  // Join a tenant's room (with optional auth check)
  socket.on('join-tenant', (data: { tenantId: string; token?: string }) => {
    // C7: If token provided, verify it. Public display connections may not have auth.
    if (data.token) {
      const payload = verifyToken(data.token);
      if (!payload) {
        console.log(`[WS] join-tenant rejected for ${socket.id}: invalid token`);
        return;
      }
      socketUsers.set(socket.id, payload.userId);
    }

    // Leave previous room
    const prevTenant = socketTenants.get(socket.id);
    if (prevTenant) {
      const prevRoom = tenantRooms.get(prevTenant);
      if (prevRoom) {
        prevRoom.delete(socket.id);
        socket.leave(`tenant:${prevTenant}`);
      }
    }

    // Join new room
    socket.join(`tenant:${data.tenantId}`);
    socketTenants.set(socket.id, data.tenantId);

    if (!tenantRooms.has(data.tenantId)) {
      tenantRooms.set(data.tenantId, new Set());
    }
    tenantRooms.get(data.tenantId)!.add(socket.id);

    console.log(`[WS] ${socket.id} joined tenant: ${data.tenantId} (room size: ${tenantRooms.get(data.tenantId)!.size})`);
  });

  // Broadcast event to a tenant's room
  socket.on('broadcast', (data: { tenantId: string; event: string; payload: Record<string, unknown> }) => {
    // C7: Verify the socket belongs to the tenant it's broadcasting to
    const socketTenant = socketTenants.get(socket.id);
    if (socketTenant && socketTenant !== data.tenantId) {
      console.log(`[WS] Broadcast rejected: socket tenant (${socketTenant}) != broadcast tenant (${data.tenantId})`);
      return;
    }

    io.to(`tenant:${data.tenantId}`).emit(data.event, data.payload);
    console.log(`[WS] Broadcast to tenant ${data.tenantId}: ${data.event}`);
  });

  // Server-side HTTP broadcast endpoint (called by API routes)
  socket.on('server-broadcast', (data: { tenantId: string; event: string; payload: Record<string, unknown> }) => {
    io.to(`tenant:${data.tenantId}`).emit(data.event, data.payload);
    console.log(`[WS] Server broadcast to tenant ${data.tenantId}: ${data.event}`);
  });

  socket.on('disconnect', () => {
    const tenantId = socketTenants.get(socket.id);
    if (tenantId) {
      const room = tenantRooms.get(tenantId);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) tenantRooms.delete(tenantId);
      }
      socketTenants.delete(socket.id);
    }
    socketUsers.delete(socket.id);
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

const PORT = 3003;
io.listen(PORT);
console.log(`[WS] Queue WebSocket server running on port ${PORT}`);