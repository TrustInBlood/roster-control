import { Clock, TrendingUp, User, Star } from 'lucide-react'
import type { DutyLeaderboardEntry } from '../../types/duty'
import { formatDuration, getRankBadge } from '../../lib/dutyUtils'

interface DutyLeaderboardProps {
  entries: DutyLeaderboardEntry[]
  isLoading?: boolean
}

export default function DutyLeaderboard({ entries, isLoading }: DutyLeaderboardProps) {
  if (isLoading) {
    return (
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <div className="p-4 border-b border-discord-lighter">
          <h3 className="text-lg font-semibold text-white">Leaderboard</h3>
        </div>
        <div className="p-8 text-center text-gray-400">Loading...</div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <div className="p-4 border-b border-discord-lighter">
          <h3 className="text-lg font-semibold text-white">Leaderboard</h3>
        </div>
        <div className="p-8 text-center text-gray-400">
          No duty time recorded for this period
        </div>
      </div>
    )
  }

  return (
    <div className="bg-discord-light rounded-lg overflow-hidden">
      <div className="p-4 border-b border-discord-lighter">
        <h3 className="text-lg font-semibold text-white">Leaderboard</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-discord-darker/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Staff Member
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Total Time
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Sessions
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Avg Session
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Longest
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Points
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-discord-lighter">
            {entries.map((entry) => {
              const badge = getRankBadge(entry.rank)
              return (
                <tr
                  key={entry.discordUserId}
                  className="hover:bg-discord-lighter/50 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-white font-medium">
                      {badge ? (
                        <span className="text-lg">{badge}</span>
                      ) : (
                        <span className="text-gray-400">#{entry.rank}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {entry.avatarUrl ? (
                        <img
                          src={entry.avatarUrl}
                          alt={entry.displayName}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-discord-blurple/30 flex items-center justify-center">
                          <User className="w-4 h-4 text-discord-blurple" />
                        </div>
                      )}
                      <span className="text-white font-medium">
                        {entry.displayName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-green-400 font-semibold">
                      {formatDuration(entry.totalTime, true)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                    {entry.sessionCount}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                    {formatDuration(entry.averageSessionTime, true)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                    {formatDuration(entry.longestSession, true)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {entry.totalPoints !== undefined ? (
                      <span className="text-yellow-400 font-semibold">
                        {entry.totalPoints.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
