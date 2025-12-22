import { Users, Clock, CalendarDays, TrendingUp, Activity } from 'lucide-react'
import type { DutySummaryStats } from '../../types/duty'
import { formatDuration } from '../../lib/dutyUtils'
import { DUTY_PERIOD_LABELS, DUTY_TYPE_LABELS } from '../../types/duty'

interface DutySummaryCardsProps {
  stats: DutySummaryStats | undefined
  isLoading?: boolean
}

export default function DutySummaryCards({ stats, isLoading }: DutySummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-discord-light rounded-lg p-4 animate-pulse">
            <div className="h-4 w-24 bg-discord-lighter rounded mb-2" />
            <div className="h-8 w-16 bg-discord-lighter rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-discord-light rounded-lg p-6 text-center text-gray-400">
        No data available for this period
      </div>
    )
  }

  const cards = [
    {
      label: 'Active Staff',
      value: stats.totalUsers.toString(),
      subtext: `${stats.currentlyOnDuty} currently on duty`,
      icon: Users,
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
    },
    {
      label: 'Total Duty Time',
      value: formatDuration(stats.totalTime, true),
      subtext: `${DUTY_PERIOD_LABELS[stats.period]} - ${DUTY_TYPE_LABELS[stats.dutyType]}`,
      icon: Clock,
      iconColor: 'text-green-400',
      bgColor: 'bg-green-400/10',
    },
    {
      label: 'Total Sessions',
      value: stats.totalSessions.toString(),
      subtext: `${(stats.averageSessionsPerUser || 0).toFixed(1)} avg per staff`,
      icon: CalendarDays,
      iconColor: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
    },
    {
      label: 'Avg Time per Staff',
      value: formatDuration(stats.averageTimePerUser, true),
      subtext: 'Per active staff member',
      icon: TrendingUp,
      iconColor: 'text-orange-400',
      bgColor: 'bg-orange-400/10',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-discord-light rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">{card.label}</span>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-xs text-gray-500 mt-1">{card.subtext}</div>
          </div>
        ))}
      </div>

      {/* Top Performers */}
      {stats.topPerformers && stats.topPerformers.length > 0 && (
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-yellow-400" />
            <h4 className="text-white font-medium">Top Performers</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.topPerformers.map((performer, index) => (
              <div
                key={performer.discordUserId}
                className="flex items-center gap-2 bg-discord-darker px-3 py-1.5 rounded-full"
              >
                <span className="text-yellow-400 text-sm">
                  {index === 0 ? '1st' : index === 1 ? '2nd' : '3rd'}
                </span>
                <span className="text-white text-sm">{performer.discordUsername}</span>
                <span className="text-gray-400 text-xs">
                  {formatDuration(performer.totalTime, true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
