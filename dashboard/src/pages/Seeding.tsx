import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw, Users, Clock, Target, Award, X, FlaskConical, AlertTriangle, RotateCcw } from 'lucide-react'
import {
  useActiveSession,
  useSessionsList,
  useCloseSession,
  useCancelSession,
  useClosePreview,
  useReverseSessionRewards,
} from '../hooks/useSeeding'
import CreateSessionModal from '../components/seeding/CreateSessionModal'
import type { SeedingSession, SeedingSessionWithStats, ClosePreviewResponse } from '../types/seeding'

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

function ActiveSessionCard({ session, onRefresh }: { session: SeedingSessionWithStats; onRefresh: () => void }) {
  const closeSession = useCloseSession()
  const cancelSession = useCancelSession()
  const closePreviewMutation = useClosePreview()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [closePreview, setClosePreview] = useState<ClosePreviewResponse | null>(null)

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

  const progressPercent = Math.min((session.stats.currentlyOnTarget / session.player_threshold) * 100, 100)

  const handleCompleteClick = async () => {
    try {
      const response = await closePreviewMutation.mutateAsync(session.id)
      setClosePreview(response.data)
      setShowCompleteConfirm(true)
    } catch (error) {
      console.error('Failed to fetch close preview:', error)
    }
  }

  const handleConfirmComplete = async () => {
    await closeSession.mutateAsync(session.id)
    setShowCompleteConfirm(false)
    setClosePreview(null)
    onRefresh()
  }

  const handleCancel = async () => {
    await cancelSession.mutateAsync({ id: session.id, reason: 'Cancelled by admin' })
    setShowCancelConfirm(false)
    onRefresh()
  }

  return (
    <div className="bg-discord-light rounded-lg p-6 border-2 border-green-500/30">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor('active')}`}>
              ACTIVE
            </span>
            {session.metadata?.testMode && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                <FlaskConical className="w-3 h-3" />
                TEST
              </span>
            )}
            <h3 className="text-lg font-semibold text-white">{session.target_server_name}</h3>
          </div>
          <p className="text-gray-400 text-sm">
            Started {formatDate(session.started_at)} by {session.started_by_name || 'Unknown'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCompleteClick}
            disabled={closePreviewMutation.isPending || closeSession.isPending}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
          >
            {closePreviewMutation.isPending ? 'Loading...' : closeSession.isPending ? 'Completing...' : 'Complete Session'}
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
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-400">Progress to threshold</span>
          <span className="text-white font-medium">
            {session.stats.currentlyOnTarget} / {session.player_threshold} players
          </span>
        </div>
        <div className="h-3 bg-discord-lighter rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-discord-lighter rounded p-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Users className="w-3 h-3" />
            Participants
          </div>
          <div className="text-white font-semibold">{session.participants_count}</div>
        </div>
        <div className="bg-discord-lighter rounded p-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Target className="w-3 h-3" />
            On Target
          </div>
          <div className="text-white font-semibold">{session.stats.currentlyOnTarget}</div>
        </div>
        <div className="bg-discord-lighter rounded p-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Award className="w-3 h-3" />
            Rewards Granted
          </div>
          <div className="text-white font-semibold">{session.rewards_granted_count}</div>
        </div>
        <div className="bg-discord-lighter rounded p-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Clock className="w-3 h-3" />
            Max Reward
          </div>
          <div className="text-white font-semibold">{totalRewardDays}d</div>
        </div>
      </div>

      {/* Rewards Config */}
      <div className="flex flex-wrap gap-2">
        {session.switch_reward_value && session.switch_reward_unit && (
          <span className="bg-discord-lighter px-2 py-1 rounded text-xs text-gray-300">
            Switch: +{formatDuration(session.switch_reward_value, session.switch_reward_unit)}
          </span>
        )}
        {session.playtime_reward_value && session.playtime_reward_unit && (
          <span className="bg-discord-lighter px-2 py-1 rounded text-xs text-gray-300">
            Playtime ({session.playtime_threshold_minutes}min): +{formatDuration(session.playtime_reward_value, session.playtime_reward_unit)}
          </span>
        )}
        {session.completion_reward_value && session.completion_reward_unit && (
          <span className="bg-discord-lighter px-2 py-1 rounded text-xs text-gray-300">
            Completion: +{formatDuration(session.completion_reward_value, session.completion_reward_unit)}
          </span>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-discord-lighter">
        <Link
          to={`/seeding/${session.id}`}
          className="text-discord-blurple hover:text-discord-blurple/80 text-sm font-medium"
        >
          View Participants &rarr;
        </Link>
      </div>

      {/* Complete Session Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-dark rounded-lg p-6 max-w-md w-full mx-4 border border-discord-lighter">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-yellow-500/20 rounded-full">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <h3 className="text-lg font-semibold text-white">Complete Session?</h3>
            </div>

            <div className="space-y-3 mb-6">
              <p className="text-gray-300">
                This will finalize the seeding session and grant completion rewards.
              </p>

              {closePreview && (
                <div className="bg-discord-lighter rounded p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Participants to reward:</span>
                    <span className="text-white font-medium">{closePreview.participantsToReward}</span>
                  </div>
                  {closePreview.sessionConfig.completionReward && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Completion reward:</span>
                        <span className="text-white font-medium">{closePreview.sessionConfig.completionReward}</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-discord-light pt-2">
                        <span className="text-gray-400">Total whitelist days:</span>
                        <span className="text-green-400 font-semibold">{closePreview.totalWhitelistDaysToGrant.toFixed(1)}</span>
                      </div>
                    </>
                  )}
                  {!closePreview.sessionConfig.completionReward && (
                    <p className="text-gray-400 text-sm italic">No completion reward configured</p>
                  )}
                </div>
              )}

              <p className="text-yellow-400 text-sm">
                This action can be reversed using the "Reverse Rewards" option after completion.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCompleteConfirm(false)
                  setClosePreview(null)
                }}
                className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmComplete}
                disabled={closeSession.isPending}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                {closeSession.isPending ? 'Completing...' : 'Confirm Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SessionHistoryRow({ session, onRefresh }: { session: SeedingSession; onRefresh: () => void }) {
  const reverseRewards = useReverseSessionRewards()
  const [showReverseConfirm, setShowReverseConfirm] = useState(false)

  const canReverse = session.status !== 'active' && session.rewards_granted_count > 0

  const handleReverseRewards = async () => {
    await reverseRewards.mutateAsync({ id: session.id, reason: 'Manual reversal from dashboard' })
    setShowReverseConfirm(false)
    onRefresh()
  }

  return (
    <>
      <tr className="border-b border-discord-lighter hover:bg-discord-lighter/50">
        <td className="px-4 py-3">
          <Link to={`/seeding/${session.id}`} className="text-white hover:text-discord-blurple">
            {session.target_server_name || session.target_server_id}
          </Link>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(session.status)}`}>
              {session.status.toUpperCase()}
            </span>
            {session.metadata?.testMode && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-500">
                <FlaskConical className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-gray-400">{session.participants_count}</td>
        <td className="px-4 py-3 text-gray-400">{session.rewards_granted_count}</td>
        <td className="px-4 py-3 text-gray-400 text-sm">{formatDate(session.started_at)}</td>
        <td className="px-4 py-3 text-gray-400 text-sm">
          {session.closed_at ? formatDate(session.closed_at) : '-'}
        </td>
        <td className="px-4 py-3 text-gray-400 text-sm">{session.started_by_name || '-'}</td>
        <td className="px-4 py-3">
          {canReverse && (
            <button
              onClick={() => setShowReverseConfirm(true)}
              className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium transition-colors"
              title="Reverse all rewards granted in this session"
            >
              <RotateCcw className="w-3 h-3" />
              Reverse
            </button>
          )}
        </td>
      </tr>

      {/* Reverse Rewards Confirmation Modal */}
      {showReverseConfirm && (
        <tr>
          <td colSpan={8} className="p-0">
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-discord-dark rounded-lg p-6 max-w-md w-full mx-4 border border-discord-lighter">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-500/20 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Reverse All Rewards?</h3>
                </div>

                <div className="space-y-3 mb-6">
                  <p className="text-gray-300">
                    This will revoke all whitelist rewards granted during this seeding session.
                  </p>

                  <div className="bg-discord-lighter rounded p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Session:</span>
                      <span className="text-white font-medium">{session.target_server_name}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-gray-400">Rewards to revoke:</span>
                      <span className="text-red-400 font-medium">{session.rewards_granted_count}</span>
                    </div>
                  </div>

                  <p className="text-red-400 text-sm">
                    This action cannot be undone. Affected players will lose their whitelist time.
                  </p>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowReverseConfirm(false)}
                    className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReverseRewards}
                    disabled={reverseRewards.isPending}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    {reverseRewards.isPending ? 'Reversing...' : 'Confirm Reverse'}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function Seeding() {
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data: activeSession, isLoading: loadingActive, refetch: refetchActive, isFetching: fetchingActive } = useActiveSession()
  const { data: historyData, isLoading: loadingHistory, refetch: refetchHistory } = useSessionsList({
    page: 1,
    limit: 20,
  })

  const handleRefresh = () => {
    refetchActive()
    refetchHistory()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Seeding Sessions</h1>
          <p className="text-gray-400 mt-1">
            Cross-server seeding incentive management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={fetchingActive}
            className="bg-discord-lighter hover:bg-discord-light text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingActive ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={!!activeSession}
            className={`${
              activeSession
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-discord-blurple hover:bg-discord-blurple/80'
            } text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2`}
          >
            <Plus className="w-4 h-4" />
            Create Session
          </button>
        </div>
      </div>

      {/* Active Session */}
      {loadingActive ? (
        <div className="bg-discord-light rounded-lg p-8 text-center">
          <div className="animate-pulse text-gray-400">Loading active session...</div>
        </div>
      ) : activeSession ? (
        <ActiveSessionCard session={activeSession} onRefresh={handleRefresh} />
      ) : (
        <div className="bg-discord-light rounded-lg p-8 text-center border border-dashed border-discord-lighter">
          <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-white mb-1">No Active Session</h3>
          <p className="text-gray-400 text-sm mb-4">
            Create a seeding session to incentivize players to switch servers.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Session
          </button>
        </div>
      )}

      {/* Session History */}
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-discord-lighter">
          <h2 className="text-lg font-semibold text-white">Session History</h2>
        </div>
        {loadingHistory ? (
          <div className="p-8 text-center">
            <div className="animate-pulse text-gray-400">Loading history...</div>
          </div>
        ) : historyData && historyData.sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-discord-lighter text-left text-sm text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Target Server</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Participants</th>
                  <th className="px-4 py-2 font-medium">Rewarded</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 font-medium">Closed</th>
                  <th className="px-4 py-2 font-medium">Started By</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyData.sessions.map((session) => (
                  <SessionHistoryRow key={session.id} session={session} onRefresh={handleRefresh} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            No session history yet.
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateSessionModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            handleRefresh()
          }}
        />
      )}
    </div>
  )
}
