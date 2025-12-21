import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Shield, User, Activity, History, Sprout, Briefcase, Link2 } from 'lucide-react'
import { usePlayerProfile } from '../hooks/usePlayers'
import { useAuth } from '../hooks/useAuth'
import { cn, formatRelativeTime } from '../lib/utils'
import CopyButton from '../components/ui/CopyButton'
import PlayerOverview from '../components/player/PlayerOverview'
import PlayerActivitySection from '../components/player/PlayerActivitySection'
import PlayerWhitelistSection from '../components/player/PlayerWhitelistSection'
import PlayerAuditSection from '../components/player/PlayerAuditSection'
import PlayerSeedingSection from '../components/player/PlayerSeedingSection'
import PlayerDutySection from '../components/player/PlayerDutySection'
import PlayerAccountSection from '../components/player/PlayerAccountSection'

type Tab = 'overview' | 'activity' | 'whitelist' | 'audit' | 'seeding' | 'duty' | 'account'

const tabs: { id: Tab; label: string; icon: React.ElementType; permission?: string }[] = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'whitelist', label: 'Whitelist', icon: Shield },
  { id: 'audit', label: 'Audit', icon: History, permission: 'VIEW_AUDIT' },
  { id: 'seeding', label: 'Seeding', icon: Sprout, permission: 'VIEW_SEEDING' },
  { id: 'duty', label: 'Duty', icon: Briefcase, permission: 'VIEW_DUTY' },
  { id: 'account', label: 'Account', icon: Link2 },
]

function formatPlaytime(minutes: number): string {
  if (minutes === 0) return '0h'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export default function PlayerProfile() {
  const { steamid64 } = useParams<{ steamid64: string }>()
  const { hasPermission } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const { data: profile, isLoading, error } = usePlayerProfile(steamid64!)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load player profile</p>
        <Link to="/players" className="text-discord-blurple hover:underline mt-2 inline-block">
          Back to players
        </Link>
      </div>
    )
  }

  // Filter tabs based on permissions and player type
  const visibleTabs = tabs.filter(tab => {
    if (tab.permission && !hasPermission(tab.permission as never)) return false
    // Only show duty tab for staff
    if (tab.id === 'duty' && !profile.isStaff) return false
    return true
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'permanent':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'expired':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
      case 'revoked':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          to="/players"
          className="text-gray-400 hover:text-white transition-colors mt-1"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          {/* Player Info Header */}
          <div className="flex items-start gap-4">
            {/* Avatar */}
            {profile.discordInfo?.avatar_url ? (
              <img
                src={profile.discordInfo.avatar_url}
                alt="Avatar"
                className="w-16 h-16 rounded-full border-2 border-discord-lighter"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-discord-lighter flex items-center justify-center">
                <User className="w-8 h-8 text-gray-400" />
              </div>
            )}

            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">
                  {profile.username || 'Unknown Player'}
                </h1>
                {profile.isStaff && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-discord-blurple/20 text-discord-blurple border border-discord-blurple/30">
                    <Shield className="w-3 h-3" />
                    Staff
                  </span>
                )}
                {profile.whitelist.hasWhitelist && (
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                      getStatusColor(profile.whitelist.status)
                    )}
                  >
                    {profile.whitelist.status}
                  </span>
                )}
              </div>

              {profile.discordInfo && (
                <p className="text-gray-400 text-sm mt-1">
                  {profile.discordInfo.discord_username}
                </p>
              )}

              <div className="flex items-center gap-2 mt-2">
                <code className="text-blue-400 font-mono text-sm">{steamid64}</code>
                <CopyButton text={steamid64!} size={4} className="text-gray-500" />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="text-gray-400">Playtime</p>
                <p className="text-white font-medium">
                  {formatPlaytime(profile.activity.totalPlaytimeMinutes)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-400">Joins</p>
                <p className="text-white font-medium">{profile.activity.joinCount}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400">Last Seen</p>
                <p className="text-white font-medium">
                  {profile.activity.lastSeen ? formatRelativeTime(profile.activity.lastSeen) : 'Never'}
                </p>
              </div>
              {profile.discordLink && (
                <div className="text-center">
                  <p className="text-gray-400">Confidence</p>
                  <p className={cn(
                    'font-medium',
                    profile.discordLink.confidence_score >= 1 ? 'text-green-400' :
                    profile.discordLink.confidence_score >= 0.7 ? 'text-yellow-400' : 'text-red-400'
                  )}>
                    {(profile.discordLink.confidence_score * 100).toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-discord-lighter">
        <nav className="flex gap-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'text-white border-discord-blurple'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <PlayerOverview profile={profile} steamid64={steamid64!} onTabChange={setActiveTab} />
        )}
        {activeTab === 'activity' && (
          <PlayerActivitySection steamid64={steamid64!} />
        )}
        {activeTab === 'whitelist' && (
          <PlayerWhitelistSection steamid64={steamid64!} profile={profile} />
        )}
        {activeTab === 'audit' && (
          <PlayerAuditSection steamid64={steamid64!} />
        )}
        {activeTab === 'seeding' && (
          <PlayerSeedingSection steamid64={steamid64!} />
        )}
        {activeTab === 'duty' && (
          <PlayerDutySection steamid64={steamid64!} />
        )}
        {activeTab === 'account' && (
          <PlayerAccountSection steamid64={steamid64!} profile={profile} />
        )}
      </div>
    </div>
  )
}
