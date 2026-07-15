import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server } from 'socket.io'

const PORT = 3003

const httpServer = createServer()

const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Socket.io/engine.io adds its own request listener which intercepts ALL
// requests when path is '/'. We remove it and re-add a wrapped version
// that only delegates to engine.io for non-emit requests.
const requestListeners = httpServer.listeners('request') as Array<
  (req: IncomingMessage, res: ServerResponse) => void
>
const engineListener = requestListeners[requestListeners.length - 1]
httpServer.removeListener('request', engineListener)

httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'POST' && req.url === '/emit') {
    let body = ''

    req.on('data', (chunk: string) => {
      body += chunk
    })

    req.on('end', () => {
      try {
        const { tenantId, event, payload } = JSON.parse(body)

        if (!tenantId || !event) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Missing tenantId or event' }))
          return
        }

        const broadcastPayload = { type: event, tenantId, payload }

        if (tenantId === 'all') {
          io.emit('event', broadcastPayload)
        } else {
          io.to(`tenant:${tenantId}`).emit('event', broadcastPayload)
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }))
      }
    })
    return
  }

  // Delegate to engine.io for all other requests (Socket.io handshake, polling, etc.)
  engineListener(req, res)
})

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)

  socket.on('join-tenant', (data: { tenantId: string }) => {
    const { tenantId } = data
    socket.join(`tenant:${tenantId}`)
    console.log(`Socket ${socket.id} joined tenant:${tenantId}`)
  })

  socket.on('leave-tenant', (data: { tenantId: string }) => {
    const { tenantId } = data
    socket.leave(`tenant:${tenantId}`)
    console.log(`Socket ${socket.id} left tenant:${tenantId}`)
  })

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`WebSocket service running on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  io.close()
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...')
  io.close()
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})