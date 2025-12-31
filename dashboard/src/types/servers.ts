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
 * Represents a member (with MEMBER role) currently online on a server
 */
export interface OnlineMember {
  discordId: string
  steamId: string
  displayName: string
}

/**
 * Represents a public player (not linked or no special roles) currently online
 */
export interface OnlinePublicPlayer {
  steamId: string
  displayName: string
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
  onlineMembers: OnlineMember[]
  onlinePublic: OnlinePublicPlayer[]
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
