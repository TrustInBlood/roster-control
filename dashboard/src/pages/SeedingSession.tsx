import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, Users, Clock, Target, Award, X, ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react'
import { useSession, useParticipants, useCloseSession, useCancelSession } from '../hooks/useSeeding'
import type { SeedingParticipant } from '../types/seeding'

function formatDuration(value: number, unit: string): string {
  return `${value}${unit.charAt(0)}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-500/20 text-green-400'
    case 'completed':
      return 'bg-blue-500/20 text-blue-400'
    case 'cancelled':
      return 'bg-red-500/20 text-red-400'
    default:
      return 'bg-gray-500/20 text-gray-400'
  }
}

function getParticipantStatusColor(status: string): string {
  switch (status) {
    case 'on_source':
      return 'bg-yellow-500/20 text-yellow-400'
    case 'switched':
      return 'bg-green-500/20 text-green-400'
    case 'playtime_met':
      return 'bg-blue-500/20 text-blue-400'
    case 'completed':
      return 'bg-purple-500/20 text-purple-400'
    case 'seeder':
      return 'bg-cyan-500/20 text-cyan-400'
    default:
      return 'bg-gray-500/20 text-gray-400'
  }
}

function getParticipantTypeColor(type: string): string {
  return type === 'switcher'
    ? 'bg-orange-500/20 text-orange-400'
    : 'bg-cyan-500/20 text-cyan-400'
}

function ParticipantRow({ participant, isActiveSession }: { participant: SeedingParticipant; isActiveSession: boolean }) {
  const formatRewardTime = (minutes: number | null) => {
    if (!minutes) return '-'
    const days = minutes / (60 * 24)
    if (days < 30) {
      const displayDays = days % 1 === 0 ? days : Math.round(days * 10) / 10
      return `${displayDays}d`
    }
    const months = days / 30
    const displayMonths = months % 1 === 0 ? months : Math.round(months * 10) / 10
    return `${displayMonths}mo`
  }

  return (
    <tr className="border-b border-discord-lighter hover:bg-discord-lighter/50">
      <td className="px-4 py-3">
        <div className="text-white font-medium">{participant.username}</div>
        <div className="text-gray-500 text-xs">{participant.steam_id}</div>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getParticipantTypeColor(participant.participant_type)}`}>
          {participant.participant_type.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getParticipantStatusColor(participant.status)}`}>
          {participant.status.replace('_', ' ').toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-400">
        {isActiveSession ? (
          participant.is_on_target ? (
            <span className="text-green-400">Online</span>
          ) : (
            <span className="text-gray-500">Offline</span>
          )
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-400">
        {participant.target_playtime_minutes}m
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          {participant.switch_rewarded_at && (
            <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-xs">Switch</span>
          )}
          {participant.playtime_rewarded_at && (
            <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-xs">Playtime</span>
          )}
          {participant.completion_rewarded_at && (
            <span className="bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded text-xs">Completion</span>
          )}
          {!participant.switch_rewarded_at && !participant.playtime_rewarded_at && !participant.completion_rewarded_at && (
            <span className="text-gray-500 text-xs">None yet</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-white font-medium">
        {formatRewardTime(participant.total_reward_minutes)}
      </td>
    </tr>
  )
}

export default function SeedingSession() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sessionId = parseInt(id || '0', 10)

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const { data: session, isLoading: loadingSession, refetch: refetchSession, isFetching } = useSession(sessionId)
  const { data: participantsData, isLoading: loadingParticipants, refetch: refetchParticipants } = useParticipants(
    sessionId,
    { page, limit: 25, status: statusFilter || undefined, participantType: typeFilter || undefined }
  )

  const closeSession = useCloseSession()
  const cancelSession = useCancelSession()

  const handleRefresh = () => {
    refetchSession()
    refetchParticipants()
  }

  const handleClose = async () => {
    await closeSession.mutateAsync(sessionId)
    handleRefresh()
  }

  const handleCancel = async () => {
    await cancelSession.mutateAsync({ id: sessionId, reason: 'Cancelled by admin' })
    setShowCancelConfirm(false)
    navigate('/seeding')
  }

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading session...</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-white mb-2">Session Not Found</h2>
        <p className="text-gray-400 mb-4">The requested seeding session could not be found.</p>
        <Link to="/seeding" className="text-discord-blurple hover:underline">
          Back to Seeding
        </Link>
      </div>
    )
  }

  const totalRewardDays = (() => {
    let total = 0
    if (session.switch_reward_value && session.switch_reward_unit) {
      total += session.switch_reward_unit === 'days' ? session.switch_reward_value :
               session.switch_reward_value * 30
    }
    if (session.playtime_reward_value && session.playtime_reward_unit) {
      total += session.playtime_reward_unit === 'days' ? session.playtime_reward_value :
               session.playtime_reward_value * 30
    }
    if (session.completion_reward_value && session.completion_reward_unit) {
      total += session.completion_reward_unit === 'days' ? session.completion_reward_value :
               session.completion_reward_value * 30
    }
    return total
  })()

  const isActive = session.status === 'active'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/seeding"
            className="text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(session.status)}`}>
                {session.status.toUpperCase()}
              </span>
              {session.metadata?.testMode && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                  <FlaskConical className="w-3 h-3" />
                  TEST
                </span>
              )}
              <h1 className="text-2xl font-bold text-white">{session.target_server_name}</h1>
            </div>
            <p className="text-gray-400 mt-1">
              Started {formatDate(session.started_at)} by {session.started_by_name || 'Unknown'}
              {session.closed_at && ` - Closed ${formatDate(session.closed_at)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="bg-discord-lighter hover:bg-discord-light text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isActive && (
            <>
              <button
                onClick={handleClose}
                disabled={closeSession.isPending}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
              >
                {closeSession.isPending ? 'Closing...' : 'Close Session'}
              </button>
              {showCancelConfirm ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={cancelSession.isPending}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                  >
                    Confirm Cancel
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="bg-red-500/20 hover:bg-red-500/40 text-red-400 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Target className="w-4 h-4" />
            Threshold
          </div>
          <div className="text-2xl font-bold text-white">{session.player_threshold}</div>
        </div>
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Users className="w-4 h-4" />
            Participants
          </div>
          <div className="text-2xl font-bold text-white">{session.participants_count}</div>
        </div>
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Award className="w-4 h-4" />
            Rewarded
          </div>
          <div className="text-2xl font-bold text-white">{session.rewards_granted_count}</div>
        </div>
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Clock className="w-4 h-4" />
            Max Reward
          </div>
          <div className="text-2xl font-bold text-white">{totalRewardDays}d</div>
        </div>
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            On Target Now
          </div>
          <div className="text-2xl font-bold text-green-400">
            {session.stats?.currentlyOnTarget ?? '-'}
          </div>
        </div>
      </div>

      {/* Rewards Config */}
      <div className="bg-discord-light rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Reward Configuration</h3>
        <div className="flex flex-wrap gap-3">
          {session.switch_reward_value && session.switch_reward_unit && (
            <div className="bg-discord-lighter px-3 py-2 rounded">
              <div className="text-xs text-gray-400">Switch Reward</div>
              <div className="text-white font-medium">+{formatDuration(session.switch_reward_value, session.switch_reward_unit)}</div>
            </div>
          )}
          {session.playtime_reward_value && session.playtime_reward_unit && (
            <div className="bg-discord-lighter px-3 py-2 rounded">
              <div className="text-xs text-gray-400">Playtime Reward ({session.playtime_threshold_minutes}min)</div>
              <div className="text-white font-medium">+{formatDuration(session.playtime_reward_value, session.playtime_reward_unit)}</div>
            </div>
          )}
          {session.completion_reward_value && session.completion_reward_unit && (
            <div className="bg-discord-lighter px-3 py-2 rounded">
              <div className="text-xs text-gray-400">Completion Reward</div>
              <div className="text-white font-medium">+{formatDuration(session.completion_reward_value, session.completion_reward_unit)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Participants Table */}
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-discord-lighter flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Participants</h2>
          <div className="flex items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
              className="bg-discord-lighter text-white text-sm rounded px-3 py-1.5 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple"
            >
              <option value="">All Types</option>
              <option value="switcher">Switchers</option>
              <option value="seeder">Seeders</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
              className="bg-discord-lighter text-white text-sm rounded px-3 py-1.5 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple"
            >
              <option value="">All Status</option>
              <option value="on_source">On Source</option>
              <option value="switched">Switched</option>
              <option value="playtime_met">Playtime Met</option>
              <option value="completed">Completed</option>
              <option value="seeder">Seeder</option>
            </select>
          </div>
        </div>

        {loadingParticipants ? (
          <div className="p-8 text-center">
            <div className="animate-pulse text-gray-400">Loading participants...</div>
          </div>
        ) : participantsData && participantsData.participants.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-discord-lighter text-left text-sm text-gray-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Player</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Online</th>
                    <th className="px-4 py-2 font-medium">Playtime</th>
                    <th className="px-4 py-2 font-medium">Rewards</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {participantsData.participants.map((participant) => (
                    <ParticipantRow key={participant.id} participant={participant} isActiveSession={isActive} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {participantsData.pages > 1 && (
              <div className="px-4 py-3 border-t border-discord-lighter flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  Showing {((page - 1) * 25) + 1} - {Math.min(page * 25, participantsData.total)} of {participantsData.total}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-discord-lighter disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-400">
                    Page {page} of {participantsData.pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(participantsData.pages, p + 1))}
                    disabled={page === participantsData.pages}
                    className="p-1 rounded hover:bg-discord-lighter disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center text-gray-400">
            No participants yet.
          </div>
        )}
      </div>
    </div>
  )
}
