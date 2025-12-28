import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Shield, Clock, AlertTriangle, CheckCircle, History, User, Calendar, Users, TrendingUp, LinkIcon } from 'lucide-react'
import type { PlayerProfile } from '../../types/player'
import { usePlayerUnlinkHistory, usePlayerLinkedAccounts, useLinkAccount } from '../../hooks/usePlayers'
import { useUpgradeConfidence } from '../../hooks/useWhitelist'
import { formatDateTime, formatRelativeTime } from '../../lib/utils'
import { cn } from '../../lib/utils'
import CopyButton from '../ui/CopyButton'

interface PlayerAccountSectionProps {
  steamid64: string
  profile: PlayerProfile
}

export default function PlayerAccountSection({ steamid64, profile }: PlayerAccountSectionProps) {
  const navigate = useNavigate()
  const [showUnlinkHistory, setShowUnlinkHistory] = useState(false)
  const [showLinkedAccounts, setShowLinkedAccounts] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeReason, setUpgradeReason] = useState('')
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkReason, setLinkReason] = useState('')
  const { data: unlinkData, isLoading: unlinkLoading } = usePlayerUnlinkHistory(
    steamid64,
    showUnlinkHistory
  )
  const { data: linkedAccountsData, isLoading: linkedAccountsLoading } = usePlayerLinkedAccounts(
    steamid64,
    showLinkedAccounts
  )
  const upgradeMutation = useUpgradeConfidence()
  const linkMutation = useLinkAccount()

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

  const formatPlaytime = (minutes: number): string => {
    if (minutes === 0) return '0h'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }

  return (
    <div className="space-y-6">
      {/* Primary Link Card */}
      <div className="bg-discord-light rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-discord-blurple" />
            Primary Account Link
          </h3>
          {profile.discordLink && profile.discordLink.confidence_score < 1.0 && (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1"
              title="Upgrade to 100% confidence"
            >
              <TrendingUp className="w-4 h-4" />
              Upgrade Confidence
            </button>
          )}
        </div>

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

      {/* Potential Links Card - shown when no verified link but potential link exists */}
      {!profile.discordLink && profile.potentialLink && (
        <div className="bg-discord-light rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-yellow-400" />
              Potential Link
            </h3>
            <button
              onClick={() => setShowLinkModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1"
            >
              <LinkIcon className="w-4 h-4" />
              Link Account
            </button>
          </div>

          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-400">Unverified Link</p>
                <p className="text-xs text-gray-400 mt-1">
                  This potential link was discovered but has not been verified.
                  Click &quot;Link Account&quot; to create a verified link.
                </p>
              </div>
            </div>

            {/* Link Details */}
            <div className="flex items-start gap-4">
              <div className={cn(
                'p-3 rounded-lg border',
                'bg-yellow-500/20 border-yellow-500/30'
              )}>
                <AlertTriangle className="w-8 h-8 text-yellow-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    Confidence Score
                  </span>
                  <span className="text-2xl font-bold text-yellow-400">
                    {(profile.potentialLink.confidence_score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Low confidence - verification required for access
                </p>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Discord ID</p>
                <div className="flex items-center gap-2">
                  <code className="text-purple-400 font-mono">{profile.potentialLink.discord_user_id}</code>
                  <CopyButton text={profile.potentialLink.discord_user_id} size={3} />
                </div>
              </div>

              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Link Source</p>
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                )}>
                  {getLinkSourceLabel(profile.potentialLink.link_source)}
                </span>
              </div>

              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Discovered</p>
                <span className="text-gray-300 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(profile.potentialLink.created_at)}
                </span>
              </div>

              {profile.potentialLink.username && (
                <div className="bg-discord-darker rounded-lg p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Username</p>
                  <span className="text-gray-300">{profile.potentialLink.username}</span>
                </div>
              )}
            </div>

            {/* Metadata (Ticket Info) */}
            {profile.potentialLink.metadata && (
              <div className="bg-discord-darker rounded-lg p-4 mt-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Discovery Details</p>
                <dl className="space-y-1 text-sm">
                  {profile.potentialLink.metadata.ticketChannelName && (
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Ticket Channel</dt>
                      <dd className="text-gray-300">#{profile.potentialLink.metadata.ticketChannelName}</dd>
                    </div>
                  )}
                  {profile.potentialLink.metadata.extractedAt && (
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Extracted At</dt>
                      <dd className="text-gray-300">{formatDateTime(profile.potentialLink.metadata.extractedAt)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Link Account Modal */}
      {showLinkModal && profile.potentialLink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Link Account</h3>
            <p className="text-sm text-gray-400 mb-4">
              Create a verified link from this potential link.
              Confidence will be upgraded from{' '}
              <span className="text-yellow-400">{(profile.potentialLink.confidence_score * 100).toFixed(0)}%</span> to{' '}
              <span className="text-green-400">100%</span>
            </p>
            <div className="bg-discord-darker rounded-lg p-3 mb-4">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Steam ID</dt>
                  <dd className="text-blue-400 font-mono">{steamid64}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Discord ID</dt>
                  <dd className="text-purple-400 font-mono">{profile.potentialLink.discord_user_id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Original Source</dt>
                  <dd className="text-gray-300 capitalize">{profile.potentialLink.link_source}</dd>
                </div>
              </dl>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!linkReason.trim() || !profile.potentialLink) return
                try {
                  await linkMutation.mutateAsync({
                    steamid64,
                    discordUserId: profile.potentialLink.discord_user_id,
                    reason: linkReason
                  })
                  setShowLinkModal(false)
                  setLinkReason('')
                } catch {
                  // Error handled by mutation
                }
              }}
              className="space-y-4"
            >
              <textarea
                value={linkReason}
                onChange={(e) => setLinkReason(e.target.value)}
                placeholder="Reason for linking (required)"
                rows={2}
                required
                className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkModal(false)
                    setLinkReason('')
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linkMutation.isPending || !linkReason.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  {linkMutation.isPending ? 'Linking...' : 'Link Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discord Account Information */}
      {profile.discordInfo && (
        <div className="bg-discord-light rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-discord-blurple" />
            Discord Account
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-discord-darker rounded-lg p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Username</p>
              <span className="text-gray-300">{profile.discordInfo.discord_username}</span>
            </div>

            {profile.discordInfo.globalName && (
              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Global Name</p>
                <span className="text-gray-300">{profile.discordInfo.globalName}</span>
              </div>
            )}

            {profile.discordInfo.nickname && (
              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Server Nickname</p>
                <span className="text-gray-300">{profile.discordInfo.nickname}</span>
              </div>
            )}

            {profile.discordInfo.joinedAt && (
              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Joined Server</p>
                <span className="text-gray-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatRelativeTime(profile.discordInfo.joinedAt)}
                </span>
              </div>
            )}

            {profile.discordInfo.createdAt && (
              <div className="bg-discord-darker rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Account Created</p>
                <span className="text-gray-300">
                  {new Date(profile.discordInfo.createdAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Discord Roles */}
      {profile.discordRoles && profile.discordRoles.length > 0 && (
        <div className="bg-discord-light rounded-lg p-6">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-discord-blurple" />
            Discord Roles
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.discordRoles.map((role) => (
              <span
                key={role.id}
                className="px-3 py-1 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: role.color !== '#000000' ? `${role.color}20` : 'rgba(255,255,255,0.1)',
                  color: role.color !== '#000000' ? role.color : '#9ca3af',
                  border: `1px solid ${role.color !== '#000000' ? role.color : 'rgba(255,255,255,0.2)'}`,
                }}
              >
                {role.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* All Steam Accounts Linked to this Discord User */}
      {profile.discordLink && (
        <div className="bg-discord-light rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              All Linked Steam Accounts
            </h3>
            {!showLinkedAccounts && (
              <button
                onClick={() => setShowLinkedAccounts(true)}
                className="text-sm text-discord-blurple hover:underline"
              >
                Load accounts
              </button>
            )}
          </div>

          {!showLinkedAccounts ? (
            <p className="text-gray-400 text-sm">
              Click &quot;Load accounts&quot; to view all Steam accounts linked to this Discord user
            </p>
          ) : linkedAccountsLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-discord-blurple"></div>
            </div>
          ) : !linkedAccountsData?.accounts.length ? (
            <p className="text-gray-400 text-sm">No linked accounts found</p>
          ) : linkedAccountsData.accounts.length === 1 ? (
            <p className="text-gray-400 text-sm">This is the only Steam account linked to this Discord user</p>
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
                      Playtime
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Whitelist
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Primary
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-discord-lighter">
                  {linkedAccountsData.accounts.map((account) => (
                    <tr
                      key={account.steamid64}
                      className={cn(
                        'hover:bg-discord-lighter/50 transition-colors',
                        account.steamid64 !== steamid64 && 'cursor-pointer'
                      )}
                      onClick={() => {
                        if (account.steamid64 !== steamid64) {
                          navigate(`/players/${account.steamid64}`)
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className={cn(
                            'text-sm font-mono',
                            account.steamid64 === steamid64 ? 'text-white font-bold' : 'text-blue-400'
                          )}>
                            {account.steamid64}
                          </code>
                          {account.steamid64 === steamid64 && (
                            <span className="text-xs text-gray-400">(current)</span>
                          )}
                          <span onClick={(e) => e.stopPropagation()}>
                            <CopyButton text={account.steamid64} size={3} />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-300">
                          {account.username || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-300">
                          {formatPlaytime(account.totalPlaytimeMinutes)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {account.hasWhitelist ? (
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                            getStatusColor(account.whitelistStatus)
                          )}>
                            {account.whitelistStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'text-sm font-medium',
                          getConfidenceColor(account.confidence_score)
                        )}>
                          {(account.confidence_score * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {account.is_primary ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
