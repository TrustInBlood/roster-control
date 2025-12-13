import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Link2, User, Calendar, Shield } from 'lucide-react'
import { useMemberDetail } from '../hooks/useMembers'
import CopyButton from '../components/ui/CopyButton'
import { formatRelativeTime } from '../lib/utils'

export default function MemberDetail() {
  const { discordId } = useParams<{ discordId: string }>()
  const navigate = useNavigate()
  const { data: member, isLoading, error } = useMemberDetail(discordId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (error || !member) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/members')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Members
        </button>
        <div className="bg-discord-light rounded-lg p-8 text-center">
          <p className="text-red-400">Failed to load member details</p>
        </div>
      </div>
    )
  }

  const getConfidenceColor = (score: number | undefined) => {
    if (!score) return 'text-gray-400'
    if (score >= 1) return 'text-green-400'
    if (score >= 0.7) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getConfidenceLabel = (score: number | undefined) => {
    if (!score) return 'Unknown'
    if (score >= 1) return 'Full Confidence'
    if (score >= 0.7) return 'High Confidence'
    if (score >= 0.4) return 'Medium Confidence'
    return 'Low Confidence'
  }

  const getLinkSourceLabel = (source: string) => {
    switch (source) {
      case 'manual': return 'Manual Link'
      case 'squadjs': return 'SquadJS Verified'
      case 'ticket': return 'Ticket System'
      case 'import': return 'Imported'
      default: return source
    }
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/members')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Members
      </button>

      {/* Header Card */}
      <div className="bg-discord-light rounded-lg p-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <img
            src={member.avatarUrl}
            alt={member.username}
            className="w-24 h-24 rounded-full"
          />

          {/* User Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{member.displayName}</h1>
              {member.isMember && (
                <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full">
                  Member
                </span>
              )}
            </div>
            <p className="text-gray-400 mb-4">@{member.username}</p>

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-4 text-sm">
              {member.nickname && (
                <div className="flex items-center gap-2 text-gray-300">
                  <User className="w-4 h-4 text-gray-500" />
                  <span>Nickname: {member.nickname}</span>
                </div>
              )}
              {member.joinedAt && (
                <div className="flex items-center gap-2 text-gray-300">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span>Joined {formatRelativeTime(member.joinedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* BattleMetrics Link */}
          {member.battlemetrics?.found && member.battlemetrics.profileUrl && (
            <a
              href={member.battlemetrics.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              BattleMetrics
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Steam Link Info */}
        <div className="bg-discord-light rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-discord-blurple" />
            Steam Account Link
          </h2>

          {member.link ? (
            <div className="space-y-4">
              {/* Steam ID */}
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                  Steam64 ID
                </label>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-blue-400 font-mono bg-discord-darker px-3 py-2 rounded">
                    {member.link.steamid64}
                  </code>
                  <CopyButton text={member.link.steamid64} size={4} />
                </div>
              </div>

              {/* EOS ID */}
              {member.link.eosID && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                    EOS ID
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-gray-300 font-mono bg-discord-darker px-3 py-2 rounded truncate max-w-xs">
                      {member.link.eosID}
                    </code>
                    <CopyButton text={member.link.eosID} size={4} />
                  </div>
                </div>
              )}

              {/* Confidence Score */}
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                  Link Confidence
                </label>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${getConfidenceColor(member.link.confidence_score)}`}>
                    {member.link.confidence_score !== undefined
                      ? `${(member.link.confidence_score * 100).toFixed(0)}%`
                      : 'Unknown'}
                  </span>
                  <span className="text-gray-400 text-sm">
                    ({getConfidenceLabel(member.link.confidence_score)})
                  </span>
                </div>
              </div>

              {/* Link Source */}
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                  Link Source
                </label>
                <span className="text-gray-300">
                  {getLinkSourceLabel(member.link.link_source)}
                </span>
              </div>

              {/* Linked At */}
              {member.link.linked_at && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                    Linked
                  </label>
                  <span className="text-gray-300">
                    {formatRelativeTime(member.link.linked_at)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No Steam account linked</p>
            </div>
          )}
        </div>

        {/* BattleMetrics Info */}
        <div className="bg-discord-light rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-discord-blurple" />
            BattleMetrics
          </h2>

          {member.battlemetrics?.found ? (
            <div className="space-y-4">
              {/* Player Name */}
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                  Player Name
                </label>
                <span className="text-white font-medium">
                  {member.battlemetrics.playerName || 'Unknown'}
                </span>
              </div>

              {/* Player ID */}
              {member.battlemetrics.playerId && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                    Player ID
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-gray-300 font-mono bg-discord-darker px-3 py-2 rounded">
                      {member.battlemetrics.playerId}
                    </code>
                    <CopyButton text={member.battlemetrics.playerId} size={4} />
                  </div>
                </div>
              )}

              {/* Profile Link */}
              {member.battlemetrics.profileUrl && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                    Profile
                  </label>
                  <a
                    href={member.battlemetrics.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-discord-blurple hover:underline flex items-center gap-1"
                  >
                    View on BattleMetrics
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ) : member.link?.steamid64 ? (
            <div className="text-center py-8 text-gray-400">
              <ExternalLink className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Player not found in BattleMetrics</p>
              {member.battlemetrics?.error && (
                <p className="text-xs text-red-400 mt-1">{member.battlemetrics.error}</p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <ExternalLink className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No Steam ID linked to lookup</p>
            </div>
          )}
        </div>
      </div>

      {/* Discord Roles */}
      <div className="bg-discord-light rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-discord-blurple" />
          Discord Roles
        </h2>

        {member.roles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {member.roles.map((role) => (
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
        ) : (
          <p className="text-gray-400">No roles assigned</p>
        )}
      </div>

      {/* Account Info */}
      <div className="bg-discord-light rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-discord-blurple" />
          Account Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
              Discord ID
            </label>
            <div className="flex items-center gap-2">
              <code className="text-sm text-gray-300 font-mono">
                {member.discord_user_id}
              </code>
              <CopyButton text={member.discord_user_id} size={3} />
            </div>
          </div>

          {member.globalName && (
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                Global Name
              </label>
              <span className="text-gray-300">{member.globalName}</span>
            </div>
          )}

          {member.joinedAt && (
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                Joined Server
              </label>
              <span className="text-gray-300">
                {new Date(member.joinedAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {member.createdAt && (
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase mb-1">
                Account Created
              </label>
              <span className="text-gray-300">
                {new Date(member.createdAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
