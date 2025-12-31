import { useState } from 'react'
import { Activity, Shield, History, Link2, ExternalLink, TrendingUp, AlertTriangle } from 'lucide-react'
import type { PlayerProfile } from '../../types/player'
import { cn, formatRelativeTime } from '../../lib/utils'
import { useUpgradeConfidence } from '../../hooks/useWhitelist'
import { DutyStatsCard } from '../duty'

interface PlayerOverviewProps {
  profile: PlayerProfile
  steamid64: string
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

export default function PlayerOverview({ profile, steamid64, onTabChange }: PlayerOverviewProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const upgradeMutation = useUpgradeConfidence()
  const [upgradeReason, setUpgradeReason] = useState('')

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
      <div className="bg-discord-light rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-purple-400" />
            <h3 className="font-medium text-white">Account Link</h3>
          </div>
          {profile.discordLink && profile.discordLink.confidence_score < 1.0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowUpgradeModal(true)
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
              title="Upgrade to 100% confidence"
            >
              <TrendingUp className="w-3 h-3" />
              Upgrade
            </button>
          )}
        </div>
        <button
          onClick={() => onTabChange('account')}
          className="w-full text-left"
        >
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
          ) : profile.potentialLink ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-yellow-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Potential link found</span>
              </div>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Confidence</dt>
                  <dd className="text-yellow-400 font-medium">
                    {(profile.potentialLink.confidence_score * 100).toFixed(0)}%
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Source</dt>
                  <dd className="text-white capitalize">{profile.potentialLink.link_source}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No account linked</p>
          )}
          <p className="text-xs text-discord-blurple mt-3 hover:underline">View account details</p>
        </button>
      </div>

      {/* BattleMetrics Card */}
      <div className="bg-discord-light rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <ExternalLink className="w-5 h-5 text-orange-400" />
          <h3 className="font-medium text-white">BattleMetrics</h3>
        </div>
        {profile.battlemetrics?.found ? (
          <div className="space-y-3">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Player Name</dt>
                <dd className="text-white">{profile.battlemetrics.playerName || 'Unknown'}</dd>
              </div>
              {profile.battlemetrics.playerId && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Player ID</dt>
                  <dd className="text-gray-300 font-mono text-xs">{profile.battlemetrics.playerId}</dd>
                </div>
              )}
            </dl>
            {profile.battlemetrics.profileUrl && (
              <a
                href={profile.battlemetrics.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                View Profile
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            {profile.battlemetrics?.error || 'Player not found in BattleMetrics'}
          </p>
        )}
      </div>

      {/* Community Ban List Card */}
      <div className="bg-discord-light rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className={cn(
            'w-5 h-5',
            profile.communityBanList?.found && (profile.communityBanList.reputationPoints ?? 0) >= 3
              ? 'text-red-400'
              : profile.communityBanList?.found && (profile.communityBanList.reputationPoints ?? 0) >= 1
                ? 'text-yellow-400'
                : 'text-green-400'
          )} />
          <h3 className="font-medium text-white">Community Ban List</h3>
        </div>
        {profile.communityBanList?.found ? (
          <div className="space-y-3">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-400">Reputation Points</dt>
                <dd className={cn(
                  'font-medium',
                  (profile.communityBanList.reputationPoints ?? 0) >= 3
                    ? 'text-red-400'
                    : (profile.communityBanList.reputationPoints ?? 0) >= 1
                      ? 'text-yellow-400'
                      : 'text-green-400'
                )}>
                  {profile.communityBanList.reputationPoints ?? 0}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Risk Rating</dt>
                <dd className="text-white">{(profile.communityBanList.riskRating ?? 0).toFixed(1)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Active Bans</dt>
                <dd className={cn(
                  'font-medium',
                  (profile.communityBanList.activeBansCount ?? 0) > 0 ? 'text-red-400' : 'text-green-400'
                )}>
                  {profile.communityBanList.activeBansCount ?? 0}
                </dd>
              </div>
              {(profile.communityBanList.expiredBansCount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-400">Expired Bans</dt>
                  <dd className="text-gray-300">{profile.communityBanList.expiredBansCount}</dd>
                </div>
              )}
            </dl>
            {profile.communityBanList.profileUrl && (
              <a
                href={profile.communityBanList.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                View Profile
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            {profile.communityBanList?.error || 'Player not found in Community Ban List'}
          </p>
        )}
      </div>

      {/* Discord Roles Card (if applicable) */}
      {profile.discordRoles && profile.discordRoles.length > 0 && (
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-discord-blurple" />
            <h3 className="font-medium text-white">Discord Roles</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.discordRoles.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
                style={{
                  borderColor: role.color !== '#000000' ? role.color : undefined,
                  color: role.color !== '#000000' ? role.color : undefined
                }}
              >
                {role.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Duty Stats Card (for staff members) */}
      {profile.isStaff && profile.discordLink && (
        <DutyStatsCard discordId={profile.discordLink.discord_user_id} />
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

      {/* Upgrade Confidence Modal */}
      {showUpgradeModal && profile.discordLink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Upgrade Confidence</h3>
            <p className="text-sm text-gray-400 mb-4">
              Upgrade from <span className="text-yellow-400">{(profile.discordLink.confidence_score * 100).toFixed(0)}%</span> to{' '}
              <span className="text-green-400">100%</span>
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!upgradeReason.trim()) return
                try {
                  await upgradeMutation.mutateAsync({ steamid64, reason: upgradeReason })
                  setShowUpgradeModal(false)
                  setUpgradeReason('')
                } catch {
                  // Error handled by mutation
                }
              }}
              className="space-y-4"
            >
              <textarea
                value={upgradeReason}
                onChange={(e) => setUpgradeReason(e.target.value)}
                placeholder="Reason (required)"
                rows={2}
                required
                className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowUpgradeModal(false)
                    setUpgradeReason('')
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={upgradeMutation.isPending || !upgradeReason.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  {upgradeMutation.isPending ? 'Upgrading...' : 'Upgrade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
