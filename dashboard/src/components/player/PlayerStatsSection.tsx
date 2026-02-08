import { useState } from 'react'
import { BarChart3, Skull, Crosshair, Heart, RotateCcw, AlertTriangle, Users } from 'lucide-react'
import { usePlayerGameStats, usePlayerKillfeed, useResetPlayerStats } from '../../hooks/usePlayers'
import { useAuth } from '../../hooks/useAuth'
import { cn, formatRelativeTime, formatDateTime } from '../../lib/utils'
import type { PlayerProfile } from '../../types/player'

interface PlayerStatsSectionProps {
  steamid64: string
  profile: PlayerProfile
}

export default function PlayerStatsSection({ steamid64, profile }: PlayerStatsSectionProps) {
  const { hasPermission } = useAuth()
  const { data, isLoading, error } = usePlayerGameStats(steamid64)
  const [showResetStatsModal, setShowResetStatsModal] = useState(false)
  const resetStatsMutation = useResetPlayerStats()
  const [resetStatsReason, setResetStatsReason] = useState('')
  const { data: killfeedData, isLoading: killfeedLoading } = usePlayerKillfeed(steamid64)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-discord-light rounded-lg p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
        <p className="text-gray-400">Unable to load game stats</p>
        <p className="text-sm text-gray-500 mt-1">
          The stats service may be temporarily unavailable. Please try again later.
        </p>
      </div>
    )
  }

  if (!data?.stats) {
    return (
      <div className="bg-discord-light rounded-lg p-8 text-center">
        <BarChart3 className="w-8 h-8 text-gray-500 mx-auto mb-3" />
        <p className="text-gray-400">No game stats found</p>
        <p className="text-sm text-gray-500 mt-1">
          This player may not have played on our servers yet.
        </p>
      </div>
    )
  }

  const { stats } = data
  const statsResetAt = data.statsResetAt ?? profile.statsResetAt
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-medium text-white">Game Statistics</h3>
          {statsResetAt ? (
            <span className="text-sm text-gray-400 ml-2">
              Since {formatRelativeTime(statsResetAt)}
            </span>
          ) : (
            <span className="text-sm text-gray-400 ml-2">Lifetime</span>
          )}
        </div>
        {hasPermission('RESET_PLAYER_STATS') && (
          <button
            onClick={() => setShowResetStatsModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Stats
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <Crosshair className="w-3 h-3" />
            Kills
          </div>
          <div className="text-white text-2xl font-semibold">
            {stats.kills?.toLocaleString() ?? '0'}
          </div>
        </div>

        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <Skull className="w-3 h-3" />
            Deaths
          </div>
          <div className="text-white text-2xl font-semibold">
            {stats.deaths?.toLocaleString() ?? '0'}
          </div>
        </div>

        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <BarChart3 className="w-3 h-3" />
            K/D Ratio
          </div>
          <div className={cn(
            'text-2xl font-semibold',
            (stats.kdRatio ?? 0) >= 2.0 ? 'text-green-400' :
            (stats.kdRatio ?? 0) >= 1.0 ? 'text-white' : 'text-red-400'
          )}>
            {stats.kdRatio?.toFixed(2) ?? '0.00'}
          </div>
        </div>

        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <AlertTriangle className="w-3 h-3" />
            Teamkills
          </div>
          <div className={cn(
            'text-2xl font-semibold',
            (stats.teamkills ?? 0) > 10 ? 'text-red-400' :
            (stats.teamkills ?? 0) > 5 ? 'text-yellow-400' : 'text-white'
          )}>
            {stats.teamkills?.toLocaleString() ?? '0'}
          </div>
        </div>

        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <Heart className="w-3 h-3" />
            Revives Given
          </div>
          <div className="text-green-400 text-2xl font-semibold">
            {stats.revivesGiven?.toLocaleString() ?? '0'}
          </div>
        </div>

        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <Heart className="w-3 h-3" />
            Revives Received
          </div>
          <div className="text-blue-400 text-2xl font-semibold">
            {stats.revivesReceived?.toLocaleString() ?? '0'}
          </div>
        </div>
      </div>

      {/* Nemesis */}
      {stats.nemesis && stats.nemesis !== 'None' && (
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <Users className="w-3 h-3" />
            Nemesis
          </div>
          <div className="text-orange-400 font-semibold">
            {stats.nemesis}
          </div>
        </div>
      )}

      {/* Killfeed */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Recent Killfeed</h3>

        {killfeedLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-discord-blurple"></div>
          </div>
        ) : !killfeedData?.killfeed?.length ? (
          <div className="bg-discord-light rounded-lg p-6 text-center">
            <p className="text-gray-400 text-sm">No killfeed data available</p>
          </div>
        ) : (
          <>
            <div className="bg-discord-light rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-discord-lighter">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Player
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Weapon
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Server
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-discord-lighter">
                  {killfeedData.killfeed.map((entry, i) => (
                    <tr key={`${entry.timestamp}-${i}`} className="hover:bg-discord-lighter/50">
                      <td className="px-4 py-3">
                        {entry.type === 'kill' ? (
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
                            entry.teamkill
                              ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                              : 'bg-green-500/20 text-green-400 border-green-500/30'
                          )}>
                            <Crosshair className="w-3 h-3" />
                            {entry.teamkill ? 'TK' : 'Kill'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                            <Skull className="w-3 h-3" />
                            Death
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-white">
                          {entry.type === 'kill' ? entry.victim : entry.attacker}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-300 font-mono">
                          {entry.weapon}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-300 font-mono">
                          {entry.serverId}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-300">
                          {formatDateTime(entry.timestamp)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {killfeedData.count > 0 && (
              <p className="text-sm text-gray-400 px-4">
                {killfeedData.count} events in the last 3 days
              </p>
            )}
          </>
        )}
      </div>

      {/* Reset Stats Modal */}
      {showResetStatsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Reset Game Stats</h3>
            <p className="text-sm text-gray-400 mb-4">
              This will reset the player's game statistics (K/D, kills, deaths, etc.).
              Stats will only be calculated from this point forward.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!resetStatsReason.trim()) return
                try {
                  await resetStatsMutation.mutateAsync({ steamid64, reason: resetStatsReason })
                  setShowResetStatsModal(false)
                  setResetStatsReason('')
                } catch {
                  // Error handled by mutation
                }
              }}
              className="space-y-4"
            >
              <textarea
                value={resetStatsReason}
                onChange={(e) => setResetStatsReason(e.target.value)}
                placeholder="Reason for reset (required)"
                rows={2}
                required
                className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetStatsModal(false)
                    setResetStatsReason('')
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetStatsMutation.isPending || !resetStatsReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                >
                  {resetStatsMutation.isPending ? 'Resetting...' : 'Reset Stats'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
