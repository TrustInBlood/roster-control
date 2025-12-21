import { Activity, Shield, History, Link2 } from 'lucide-react'
import type { PlayerProfile } from '../../types/player'
import { cn, formatRelativeTime } from '../../lib/utils'

interface PlayerOverviewProps {
  profile: PlayerProfile
  onTabChange: (tab: 'activity' | 'whitelist' | 'audit' | 'seeding' | 'account') => void
}

function formatPlaytime(minutes: number): string {
  if (minutes === 0) return '0h'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export default function PlayerOverview({ profile, onTabChange }: PlayerOverviewProps) {
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Activity Card */}
      <button
        onClick={() => onTabChange('activity')}
        className="bg-discord-light rounded-lg p-4 text-left hover:bg-discord-lighter transition-colors"
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-blue-400" />
          <h3 className="font-medium text-white">Activity</h3>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-400">Total Playtime</dt>
            <dd className="text-white">{formatPlaytime(profile.activity.totalPlaytimeMinutes)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">Join Count</dt>
            <dd className="text-white">{profile.activity.joinCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-400">Last Seen</dt>
            <dd className="text-white">
              {profile.activity.lastSeen ? formatRelativeTime(profile.activity.lastSeen) : 'Never'}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-discord-blurple mt-3">View session history</p>
      </button>

      {/* Whitelist Card */}
      <button
        onClick={() => onTabChange('whitelist')}
        className="bg-discord-light rounded-lg p-4 text-left hover:bg-discord-lighter transition-colors"
      >
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-green-400" />
          <h3 className="font-medium text-white">Whitelist</h3>
        </div>
        <div className="space-y-3">
          {profile.whitelist.hasWhitelist ? (
            <>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                  getStatusColor(profile.whitelist.status)
                )}
              >
                {profile.whitelist.status}
              </span>
              {profile.whitelist.expiration && profile.whitelist.status === 'active' && (
                <p className="text-sm text-gray-400">
                  Expires {formatRelativeTime(profile.whitelist.expiration)}
                </p>
              )}
              {profile.whitelist.isPermanent && (
                <p className="text-sm text-gray-400">No expiration</p>
              )}
              <p className="text-xs text-gray-500">{profile.whitelist.entryCount} entries</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">No active whitelist</p>
          )}
        </div>
        <p className="text-xs text-discord-blurple mt-3">Manage whitelist</p>
      </button>

      {/* Account Link Card */}
      <button
        onClick={() => onTabChange('account')}
        className="bg-discord-light rounded-lg p-4 text-left hover:bg-discord-lighter transition-colors"
      >
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-5 h-5 text-purple-400" />
          <h3 className="font-medium text-white">Account Link</h3>
        </div>
        {profile.discordLink ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-400">Confidence</dt>
              <dd className={cn(
                'font-medium',
                profile.discordLink.confidence_score >= 1 ? 'text-green-400' :
                profile.discordLink.confidence_score >= 0.7 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {(profile.discordLink.confidence_score * 100).toFixed(0)}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Source</dt>
              <dd className="text-white capitalize">{profile.discordLink.link_source}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">Linked Accounts</dt>
              <dd className="text-white">{profile.allLinks.length}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-gray-400">No account linked</p>
        )}
        <p className="text-xs text-discord-blurple mt-3">View account details</p>
      </button>

      {/* Staff Roles Card (if applicable) */}
      {profile.isStaff && profile.staffRoles.length > 0 && (
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-discord-blurple" />
            <h3 className="font-medium text-white">Staff Roles</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.staffRoles.map((role, index) => (
              <span
                key={index}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-discord-blurple/20 text-discord-blurple border border-discord-blurple/30"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes Card (if applicable) */}
      {profile.notes && (
        <div className="bg-discord-light rounded-lg p-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-5 h-5 text-yellow-400" />
            <h3 className="font-medium text-white">Admin Notes</h3>
          </div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{profile.notes}</p>
        </div>
      )}
    </div>
  )
}
