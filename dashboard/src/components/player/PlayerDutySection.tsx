import { useState } from 'react'
import { usePlayerDutyHistory } from '../../hooks/usePlayers'
import { formatDateTime } from '../../lib/utils'
import { cn } from '../../lib/utils'

interface PlayerDutySectionProps {
  steamid64: string
}

export default function PlayerDutySection({ steamid64 }: PlayerDutySectionProps) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePlayerDutyHistory(steamid64, page)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (!data?.changes.length) {
    return (
      <div className="bg-discord-light rounded-lg p-8 text-center">
        <p className="text-gray-400">No duty history found</p>
        <p className="text-sm text-gray-500 mt-1">
          Duty history is only available for staff members
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
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Reason
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-discord-lighter">
            {data.changes.map((change) => (
              <tr key={change.id} className="hover:bg-discord-lighter/50">
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                    change.status
                      ? 'bg-green-500/20 text-green-400 border-green-500/30'
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                  )}>
                    {change.status ? 'On Duty' : 'Off Duty'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                    change.dutyType === 'admin'
                      ? 'bg-discord-blurple/20 text-discord-blurple border-discord-blurple/30'
                      : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                  )}>
                    {change.dutyType}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300 capitalize">
                    {change.source}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {change.reason || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {formatDateTime(change.createdAt)}
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
            {data.pagination.total} changes
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
