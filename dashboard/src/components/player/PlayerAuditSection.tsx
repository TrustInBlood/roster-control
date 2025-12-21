import { useState } from 'react'
import { usePlayerAuditLogs } from '../../hooks/usePlayers'
import { formatDateTime } from '../../lib/utils'

interface PlayerAuditSectionProps {
  steamid64: string
}

export default function PlayerAuditSection({ steamid64 }: PlayerAuditSectionProps) {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePlayerAuditLogs(steamid64, page)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (!data?.logs.length) {
    return (
      <div className="bg-discord-light rounded-lg p-8 text-center">
        <p className="text-gray-400">No audit logs found for this player</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {data.logs.map((log) => (
          <div
            key={log.id}
            className="bg-discord-light rounded-lg p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-discord-blurple/20 text-discord-blurple border border-discord-blurple/30">
                    {log.actionType}
                  </span>
                  {log.success ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                      Success
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                      Failed
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300">{log.description}</p>
                <p className="text-xs text-gray-500 mt-1">
                  By {log.actorName} at {formatDateTime(log.createdAt)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4">
          <p className="text-sm text-gray-400">
            Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to{' '}
            {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
            {data.pagination.total} logs
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
