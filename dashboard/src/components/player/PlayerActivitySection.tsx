import { useState } from 'react'
import { usePlayerSessions } from '../../hooks/usePlayers'
import { formatDateTime } from '../../lib/utils'

interface PlayerActivitySectionProps {
  steamid64: string
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '-'
  if (minutes === 0) return '< 1m'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export default function PlayerActivitySection({ steamid64 }: PlayerActivitySectionProps) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePlayerSessions(steamid64, page)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (!data?.sessions.length) {
    return (
      <div className="bg-discord-light rounded-lg p-8 text-center">
        <p className="text-gray-400">No session history found</p>
        <p className="text-sm text-gray-500 mt-1">
          Sessions are recorded when the player joins tracked servers
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-discord-lighter">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Server
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Started
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Ended
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-discord-lighter">
            {data.sessions.map((session) => (
              <tr key={session.id} className="hover:bg-discord-lighter/50">
                <td className="px-4 py-3">
                  <span className="text-sm text-white font-mono">
                    {session.serverId}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {formatDateTime(session.sessionStart)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {session.sessionEnd ? formatDateTime(session.sessionEnd) : '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-white">
                    {formatDuration(session.durationMinutes)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {session.isActive ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
                      Ended
                    </span>
                  )}
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
            {data.pagination.total} sessions
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
