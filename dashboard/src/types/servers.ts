/**
 * Represents an admin/staff member currently online on a server
 */
export interface OnlineStaff {
  discordId: string
  steamId: string
  displayName: string
  role: string
}

/**
 * Server status information
 */
export interface ServerStatus {
  id: string
  name: string
  connected: boolean
  state: string
  playerCount: number
  maxPlayers: number
  onlineStaff: OnlineStaff[]
  lastUpdate: string
}

/**
 * Server status update payload from Socket.IO
 */
export interface ServerStatusUpdate {
  servers: ServerStatus[]
  timestamp: string
}

/**
 * API response for server status endpoint
 */
export interface ServerStatusResponse {
  success: boolean
  data: ServerStatus[]
}
