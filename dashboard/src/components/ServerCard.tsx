import { Link } from 'react-router-dom'
import { Users, Wifi, WifiOff, Shield, Clock, ChevronDown, ChevronRight, UserCheck } from 'lucide-react'
import type { ServerStatus, OnlineStaff, OnlineMember, OnlinePublicPlayer } from '../types/servers'
import type { SectionPreference } from '../types/preferences'

interface SectionPreferences {
  staff: SectionPreference
  members: SectionPreference
  public: SectionPreference
}

interface ServerCardProps {
  server: ServerStatus
  expandedSections: Record<string, boolean>
  onToggleSection: (serverId: string, section: string) => void
  sectionPreferences?: SectionPreferences
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
function getRolePillStyles(roleColor?: string): React.CSSProperties {
  if (roleColor) {
    return {
      backgroundColor: roleColor,
      color: getContrastTextColor(roleColor)
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

interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  iconColor: string
  count: number
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  emptyMessage?: string
  hidden?: boolean
}

function CollapsibleSection({
  title,
  icon,
  iconColor,
  count,
  isExpanded,
  onToggle,
  children,
  emptyMessage = 'None',
  hidden,
}: CollapsibleSectionProps) {
  // If hidden via preferences, don't render
  if (hidden) {
    return null
  }

  return (
    <div className="border-t border-discord-darker pt-3 pb-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full text-left hover:bg-discord-darker/50 -mx-2 px-2 py-1 rounded transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        )}
        <span className={`w-4 h-4 ${iconColor} flex-shrink-0`}>{icon}</span>
        <span className="text-sm text-gray-400">
          {title} ({count})
        </span>
      </button>

      {isExpanded && (
        <div className="mt-2 ml-6">
          {count > 0 ? children : (
            <p className="text-sm text-gray-500 italic">{emptyMessage}</p>
          )}
        </div>
      )}
    </div>
  )
}

function StaffList({ staff }: { staff: OnlineStaff[] }) {
  return (
    <div className="space-y-1.5">
      {staff.map((s) => (
        <div
          key={s.discordId}
          className="flex items-center justify-between text-sm"
        >
          <Link
            to={`/players/${s.steamId}`}
            className="text-white truncate flex-1 mr-2 hover:text-discord-blurple transition-colors"
          >
            {s.displayName}
          </Link>
          <span
            className="text-xs px-2 py-0.5 rounded bg-discord-darker text-gray-300 flex-shrink-0"
            style={getRolePillStyles(s.roleColor)}
          >
            {s.role}
          </span>
        </div>
      ))}
    </div>
  )
}

function MemberList({ members }: { members: OnlineMember[] }) {
  return (
    <div className="space-y-1.5">
      {members.map((m) => (
        <div
          key={m.discordId}
          className="flex items-center justify-between text-sm"
        >
          <Link
            to={`/players/${m.steamId}`}
            className="text-white truncate flex-1 mr-2 hover:text-discord-blurple transition-colors"
          >
            {m.displayName}
          </Link>
          <span
            className="text-xs px-2 py-0.5 rounded bg-discord-darker text-gray-300 flex-shrink-0"
            style={getRolePillStyles(m.roleColor)}
          >
            Member
          </span>
        </div>
      ))}
    </div>
  )
}

function PublicPlayerList({ players }: { players: OnlinePublicPlayer[] }) {
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {players.map((p) => (
        <Link
          key={p.steamId}
          to={`/players/${p.steamId}`}
          className="block text-sm text-gray-400 truncate hover:text-discord-blurple transition-colors"
        >
          {p.displayName}
        </Link>
      ))}
    </div>
  )
}

export default function ServerCard({
  server,
  expandedSections,
  onToggleSection,
  sectionPreferences,
}: ServerCardProps) {
  const connectionState = getConnectionState(server)
  // When disconnected, show 0 players and no queue (data is stale)
  const displayPlayerCount = server.connected ? server.playerCount : 0
  const playerCountColor = server.connected ? getPlayerCountColor(server.playerCount, server.maxPlayers) : 'text-gray-500'
  const totalQueue = server.connected ? (server.publicQueue + server.reserveQueue) : 0
  const hasQueue = totalQueue > 0

  // Generate section keys for this server
  const staffKey = `${server.id}-staff`
  const membersKey = `${server.id}-members`
  const publicKey = `${server.id}-public`

  // Get counts with fallback for backwards compatibility
  // When disconnected, don't show player data (it's stale)
  const isConnected = server.connected
  const staffCount = isConnected ? (server.onlineStaff?.length ?? 0) : 0
  const membersCount = isConnected ? (server.onlineMembers?.length ?? 0) : 0
  const publicCount = isConnected ? (server.onlinePublic?.length ?? 0) : 0

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
            {displayPlayerCount}
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

      {/* Staff Section */}
      <CollapsibleSection
        title="Staff Online"
        icon={<Shield className="w-4 h-4" />}
        iconColor="text-discord-blurple"
        count={staffCount}
        isExpanded={expandedSections[staffKey] ?? false}
        onToggle={() => onToggleSection(server.id, 'staff')}
        emptyMessage={isConnected ? 'No staff online' : 'Server disconnected'}
        hidden={sectionPreferences?.staff?.hidden}
      >
        <StaffList staff={isConnected ? (server.onlineStaff || []) : []} />
      </CollapsibleSection>

      {/* Members Section */}
      <CollapsibleSection
        title="Members"
        icon={<UserCheck className="w-4 h-4" />}
        iconColor="text-green-400"
        count={membersCount}
        isExpanded={expandedSections[membersKey] ?? false}
        onToggle={() => onToggleSection(server.id, 'members')}
        emptyMessage={isConnected ? 'No members online' : 'Server disconnected'}
        hidden={sectionPreferences?.members?.hidden}
      >
        <MemberList members={isConnected ? (server.onlineMembers || []) : []} />
      </CollapsibleSection>

      {/* Public Players Section */}
      <CollapsibleSection
        title="Public"
        icon={<Users className="w-4 h-4" />}
        iconColor="text-gray-400"
        count={publicCount}
        isExpanded={expandedSections[publicKey] ?? false}
        onToggle={() => onToggleSection(server.id, 'public')}
        emptyMessage={isConnected ? 'No public players' : 'Server disconnected'}
        hidden={sectionPreferences?.public?.hidden}
      >
        <PublicPlayerList players={isConnected ? (server.onlinePublic || []) : []} />
      </CollapsibleSection>
    </div>
  )
}
