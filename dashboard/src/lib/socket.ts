import { io, Socket } from 'socket.io-client'
import type { ServerStatusUpdate } from '../types/servers'

// Socket.IO client instance - lazy initialized
let socket: Socket | null = null

// Connection state
let connectionAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10

// Event handlers
type ServerStatusHandler = (data: ServerStatusUpdate) => void
const serverStatusHandlers = new Set<ServerStatusHandler>()

/**
 * Get or create the Socket.IO connection
 */
export function getSocket(): Socket {
  if (!socket) {
    // Create socket with same-origin connection (uses session cookie)
    socket = io({
      path: '/socket.io',
      withCredentials: true,
      autoConnect: false, // We'll connect manually
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    // Setup event handlers
    socket.on('connect', () => {
      connectionAttempts = 0
      console.log('[Socket] Connected to server')
    })

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
    })

    socket.on('connect_error', (error) => {
      connectionAttempts++
      console.error('[Socket] Connection error:', error.message)

      if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('[Socket] Max reconnection attempts reached')
      }
    })

    // Forward server status events to all registered handlers
    socket.on('serverStatus', (data: ServerStatusUpdate) => {
      serverStatusHandlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error('[Socket] Error in serverStatus handler:', error)
        }
      })
    })
  }

  return socket
}

/**
 * Connect to the socket server
 */
export function connect(): void {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
  }
}

/**
 * Disconnect from the socket server
 */
export function disconnect(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
}

/**
 * Check if socket is connected
 */
export function isConnected(): boolean {
  return socket?.connected ?? false
}

/**
 * Register a handler for server status updates
 */
export function onServerStatus(handler: ServerStatusHandler): () => void {
  serverStatusHandlers.add(handler)

  // Return unsubscribe function
  return () => {
    serverStatusHandlers.delete(handler)
  }
}

/**
 * Request a server status refresh from the server
 */
export function requestServerStatus(): void {
  if (socket?.connected) {
    socket.emit('requestServerStatus')
  }
}

export default {
  getSocket,
  connect,
  disconnect,
  isConnected,
  onServerStatus,
  requestServerStatus,
}
