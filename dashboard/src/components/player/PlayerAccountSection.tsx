import { useState } from 'react'
import { Link2, Shield, Clock, AlertTriangle, CheckCircle, History } from 'lucide-react'
import type { PlayerProfile } from '../../types/player'
import { usePlayerUnlinkHistory } from '../../hooks/usePlayers'
import { formatDateTime } from '../../lib/utils'
import { cn } from '../../lib/utils'
import CopyButton from '../ui/CopyButton'

interface PlayerAccountSectionProps {
  steamid64: string
  profile: PlayerProfile
}

export default function PlayerAccountSection({ steamid64, profile }: PlayerAccountSectionProps) {
  const [showUnlinkHistory, setShowUnlinkHistory] = useState(false)
  const { data: unlinkData, isLoading: unlinkLoading } = usePlayerUnlinkHistory(
    steamid64,
    showUnlinkHistory
  )

  const getConfidenceColor = (score: number) => {
    if (score >= 1) return 'text-green-400'
    if (score >= 0.7) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getConfidenceBg = (score: number) => {
    if (score >= 1) return 'bg-green-500/20 border-green-500/30'
    if (score >= 0.7) return 'bg-yellow-500/20 border-yellow-500/30'
    return 'bg-red-500/20 border-red-500/30'
  }

  const getLinkSourceLabel = (source: string) => {
    switch (source) {
      case 'manual':
        return 'Admin Link'
      case 'ticket':
        return 'Ticket'
      case 'squadjs':
        return 'In-Game Verification'
      case 'import':
        return 'Import'
      default:
        return source
    }
  }

  return (
    <div className="space-y-6">
      {/* Primary Link Card */}
      <div className="bg-discord-light rounded-lg p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-discord-blurple" />
          Primary Account Link
        </h3>

        {profile.discordLink ? (
          <div className="space-y-4">
            {/* Link Status */}
            <div className="flex items-start gap-4">
              <div className={cn(
                'p-3 rounded-lg border',
                getConfidenceBg(profile.discordLink.confidence_score)
              )}>
                {profile.discordLink.confidence_score >= 1 ? (
                  <CheckCircle className="w-8 h-8 text-green-400" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-yellow-400" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    Confidence Score
                  </span>
                  <span className={cn(
                    'text-2xl font-bold',
                    getConfidenceColor(profile.discordLink.confidence_score)
                  )}>
                    {(profile.discordLink.confidence_score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  {profile.discordLink.confidence_score >= 1
                    ? 'High confidence link - meets staff requirements'
                    : profile.discordLink.confidence_score >= 0.7
                    ? 'Medium confidence - may need verification for staff roles'
                    : 'Low confidence - verification required for most features'
                  }
                </p>
              </div>
            </div>

            {/* Link Details */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Steam ID</p>
                <div className="flex items-center gap-2">
                  <code className="text-blue-400 font-mono">{steamid64}</code>
                  <CopyButton text={steamid64} size={3} />
                </div>
              </div>

              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Discord ID</p>
                <div className="flex items-center gap-2">
                  <code className="text-purple-400 font-mono">{profile.discordLink.discord_user_id}</code>
                  <CopyButton text={profile.discordLink.discord_user_id} size={3} />
                </div>
              </div>

              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Link Source</p>
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                  profile.discordLink.link_source === 'squadjs'
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                )}>
                  {getLinkSourceLabel(profile.discordLink.link_source)}
                </span>
              </div>

              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Linked At</p>
                <span className="text-gray-300 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(profile.discordLink.created_at)}
                </span>
              </div>
            </div>

            {/* EOS ID if present */}
            {profile.eosID && (
              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">EOS ID</p>
                <div className="flex items-center gap-2">
                  <code className="text-green-400 font-mono text-sm">{profile.eosID}</code>
                  <CopyButton text={profile.eosID} size={3} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <p className="text-white font-medium">No Account Link</p>
            <p className="text-sm text-gray-400 mt-1">
              This player has not linked their Steam account to Discord
            </p>
          </div>
        )}
      </div>

      {/* All Linked Accounts */}
      {profile.allLinks.length > 1 && (
        <div className="bg-discord-light rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            All Linked Accounts ({profile.allLinks.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-discord-lighter">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Steam ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Primary
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Linked
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-discord-lighter">
                {profile.allLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-discord-lighter/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-sm text-blue-400 font-mono">
                          {link.steamid64}
                        </code>
                        <CopyButton text={link.steamid64} size={3} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300">
                        {link.username || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'text-sm font-medium',
                        getConfidenceColor(link.confidence_score)
                      )}>
                        {(link.confidence_score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                        link.link_source === 'squadjs'
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                      )}>
                        {getLinkSourceLabel(link.link_source)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {link.is_primary ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300">
                        {formatDateTime(link.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unlink History */}
      <div className="bg-discord-light rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <History className="w-5 h-5 text-red-400" />
            Unlink History
          </h3>
          {!showUnlinkHistory && (
            <button
              onClick={() => setShowUnlinkHistory(true)}
              className="text-sm text-discord-blurple hover:underline"
            >
              Load history
            </button>
          )}
        </div>

        {!showUnlinkHistory ? (
          <p className="text-gray-400 text-sm">
            Click &quot;Load history&quot; to view previous unlinked accounts
          </p>
        ) : unlinkLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-discord-blurple"></div>
          </div>
        ) : !unlinkData?.history.length ? (
          <p className="text-gray-400 text-sm">No unlink history found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-discord-lighter">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Steam ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Unlinked At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-discord-lighter">
                {unlinkData.history.map((entry) => (
                  <tr key={entry.id} className="hover:bg-discord-lighter/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-sm text-blue-400 font-mono">
                          {entry.steamid64}
                        </code>
                        <CopyButton text={entry.steamid64} size={3} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300">
                        {entry.username || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300">
                        {entry.reason || 'No reason provided'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300">
                        {formatDateTime(entry.unlinked_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Roles Section - if staff */}
      {profile.isStaff && profile.staffRoles.length > 0 && (
        <div className="bg-discord-light rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-discord-blurple" />
            Staff Roles
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.staffRoles.map((role) => (
              <span
                key={role}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-discord-blurple/20 text-discord-blurple border border-discord-blurple/30"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
