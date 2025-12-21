import { useState } from 'react'
import { usePlayerSeedingActivity } from '../../hooks/usePlayers'
import { formatDateTime } from '../../lib/utils'
import { cn } from '../../lib/utils'

interface PlayerSeedingSectionProps {
  steamid64: string
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export default function PlayerSeedingSection({ steamid64 }: PlayerSeedingSectionProps) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePlayerSeedingActivity(steamid64, page)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (!data?.participations.length) {
    return (
      <div className="bg-discord-light rounded-lg p-8 text-center">
        <p className="text-gray-400">No seeding activity found</p>
        <p className="text-sm text-gray-500 mt-1">
          Seeding activity is recorded when the player participates in seeding sessions
        </p>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'playtime_met':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'switched':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'seeder':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'on_source':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-discord-lighter">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Session
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Playtime
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Reward
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-discord-lighter">
            {data.participations.map((participation) => (
              <tr key={participation.id} className="hover:bg-discord-lighter/50">
                <td className="px-4 py-3">
                  <span className="text-sm text-white">
                    {participation.sessionName || `Session #${participation.sessionId}`}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                    participation.participantType === 'switcher'
                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                      : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                  )}>
                    {participation.participantType}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                    getStatusColor(participation.status)
                  )}>
                    {participation.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-white">
                    {formatDuration(participation.targetPlaytimeMinutes)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-green-400">
                    +{formatDuration(participation.totalRewardMinutes)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {formatDateTime(participation.createdAt)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4">
          <p className="text-sm text-gray-400">
            Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to{' '}
            {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
            {data.pagination.total} participations
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 text-sm bg-discord-darker border border-discord-lighter rounded hover:bg-discord-lighter disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {page} of {data.pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= data.pagination.totalPages}
              className="px-3 py-1 text-sm bg-discord-darker border border-discord-lighter rounded hover:bg-discord-lighter disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
