import { Clock, CalendarDays, TrendingUp, Activity } from 'lucide-react'
import { useDutyUserStats } from '../../hooks/useDutyStats'
import { formatDuration } from '../../lib/dutyUtils'

interface DutyStatsCardProps {
  discordId: string
  className?: string
}

export default function DutyStatsCard({ discordId, className = '' }: DutyStatsCardProps) {
  const { data, isLoading, error } = useDutyUserStats(discordId, 'all-time', 'both')

  // Don't render anything while loading or if no data
  if (isLoading) {
    return null
  }

  // Don't render if error, no data, or no duty time recorded
  if (error || !data?.data || data.data.sessionCount === 0) {
    return null
  }

  const stats = data.data

  return (
    <div className={`bg-discord-light rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-green-400" />
          <h3 className="text-white font-medium">Duty Stats</h3>
        </div>
        {stats.currentlyOnDuty && (
          <span className="flex items-center gap-1.5 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
            <Activity className="w-3 h-3" />
            On Duty
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-discord-darker rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <Clock className="w-3 h-3" />
            Total Time
          </div>
          <div className="text-white font-semibold">
            {formatDuration(stats.totalTime, true)}
          </div>
        </div>

        <div className="bg-discord-darker rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <CalendarDays className="w-3 h-3" />
            Sessions
          </div>
          <div className="text-white font-semibold">{stats.sessionCount}</div>
        </div>

        <div className="bg-discord-darker rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <TrendingUp className="w-3 h-3" />
            Avg Session
          </div>
          <div className="text-white font-semibold">
            {formatDuration(stats.averageSessionTime, true)}
          </div>
        </div>

        <div className="bg-discord-darker rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
            <Activity className="w-3 h-3" />
            Longest
          </div>
          <div className="text-white font-semibold">
            {formatDuration(stats.longestSession, true)}
          </div>
        </div>
      </div>

      {stats.lastActive && (
        <div className="mt-3 text-xs text-gray-500">
          Last active: {new Date(stats.lastActive).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}
