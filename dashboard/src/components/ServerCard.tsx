import { Users, Wifi, WifiOff, Shield, Clock } from 'lucide-react'
import type { ServerStatus, OnlineStaff } from '../types/servers'

interface ServerCardProps {
  server: ServerStatus
}

/**
 * Get a color class based on player count percentage
 */
function getPlayerCountColor(playerCount: number, maxPlayers: number): string {
  const percentage = (playerCount / maxPlayers) * 100
  if (percentage >= 90) return 'text-green-400'
  if (percentage >= 50) return 'text-yellow-400'
  if (percentage >= 20) return 'text-orange-400'
  return 'text-gray-400'
}

/**
 * Calculate whether text should be light or dark based on background color
 * Uses relative luminance formula
 */
function getContrastTextColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  // Return white for dark backgrounds, dark for light backgrounds
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff'
}

/**
 * Get role pill styles based on Discord role color
 */
function getRolePillStyles(staff: OnlineStaff): React.CSSProperties {
  if (staff.roleColor) {
    return {
      backgroundColor: staff.roleColor,
      color: getContrastTextColor(staff.roleColor)
    }
  }
  // Default fallback style
  return {}
}

/**
 * Get connection state display info
 */
function getConnectionState(server: ServerStatus): { color: string; label: string } {
  if (!server.connected) {
    return { color: 'text-red-400', label: 'Disconnected' }
  }

  switch (server.state) {
    case 'connected':
      return { color: 'text-green-400', label: 'Connected' }
    case 'degraded':
      return { color: 'text-yellow-400', label: 'Degraded' }
    case 'connecting':
      return { color: 'text-blue-400', label: 'Connecting' }
    case 'failed':
      return { color: 'text-red-400', label: 'Failed' }
    default:
      return { color: 'text-gray-400', label: server.state || 'Unknown' }
  }
}

export default function ServerCard({ server }: ServerCardProps) {
  const connectionState = getConnectionState(server)
  const playerCountColor = getPlayerCountColor(server.playerCount, server.maxPlayers)
  const hasStaffOnline = server.onlineStaff.length > 0
  const totalQueue = server.publicQueue + server.reserveQueue
  const hasQueue = totalQueue > 0

  return (
    <div className="bg-discord-light rounded-lg p-5 hover:bg-discord-lighter transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">{server.name}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            {server.connected ? (
              <Wifi className={`w-3.5 h-3.5 ${connectionState.color}`} />
            ) : (
              <WifiOff className={`w-3.5 h-3.5 ${connectionState.color}`} />
            )}
            <span className={`text-xs ${connectionState.color}`}>{connectionState.label}</span>
          </div>
        </div>

        {/* Player Count & Queue */}
        <div className="text-right">
          <div className={`text-2xl font-bold ${playerCountColor}`}>
            {server.playerCount}
            <span className="text-gray-500 text-lg">/{server.maxPlayers}</span>
          </div>
          <div className="flex items-center gap-1 justify-end text-xs text-gray-400">
            <Users className="w-3 h-3" />
            <span>players</span>
          </div>
          {hasQueue && (
            <div className="flex items-center gap-1 justify-end text-xs text-yellow-400 mt-1">
              <Clock className="w-3 h-3" />
              <span>{totalQueue} in queue</span>
              {server.reserveQueue > 0 && (
                <span className="text-gray-500">({server.reserveQueue} res)</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Staff Online */}
      <div className="border-t border-discord-darker pt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Shield className="w-4 h-4 text-discord-blurple" />
          <span className="text-sm text-gray-400">
            Staff Online ({server.onlineStaff.length})
          </span>
        </div>

        {hasStaffOnline ? (
          <div className="space-y-1.5">
            {server.onlineStaff.map((staff) => (
              <div
                key={staff.discordId}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-white truncate flex-1 mr-2">
                  {staff.displayName}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded bg-discord-darker text-gray-300"
                  style={getRolePillStyles(staff)}
                >
                  {staff.role}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No staff online</p>
        )}
      </div>
    </div>
  )
}
