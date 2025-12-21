/**
 * Represents an admin/staff member currently online on a server
 */
export interface OnlineStaff {
  discordId: string
  steamId: string
  displayName: string
  role: string
  roleColor?: string // Hex color from Discord role
  rolePriority: number // Higher = more senior role, used for sorting
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
  publicQueue: number
  reserveQueue: number
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
