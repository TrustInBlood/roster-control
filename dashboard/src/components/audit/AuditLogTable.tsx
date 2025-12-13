import { ChevronUp, ChevronDown, CheckCircle, XCircle, Eye } from 'lucide-react'
import type { AuditLogEntry } from '../../types/audit'
import { cn, formatDateTime, getSeverityColor, formatActionType } from '../../lib/utils'

interface AuditLogTableProps {
  entries: AuditLogEntry[]
  isLoading: boolean
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  onPageChange: (page: number) => void
  onRowClick: (entry: AuditLogEntry) => void
  onSort: (sortBy: string, sortOrder: 'ASC' | 'DESC') => void
  currentSort: {
    sortBy: string
    sortOrder: 'ASC' | 'DESC'
  }
}

const columns = [
  { key: 'createdAt', label: 'Time', sortable: true },
  { key: 'actionType', label: 'Action', sortable: true },
  { key: 'actorName', label: 'Actor', sortable: true },
  { key: 'targetName', label: 'Target', sortable: true },
  { key: 'severity', label: 'Severity', sortable: true },
  { key: 'success', label: 'Result', sortable: false },
  { key: 'actions', label: '', sortable: false },
]

export default function AuditLogTable({
  entries,
  isLoading,
  pagination,
  onPageChange,
  onRowClick,
  onSort,
  currentSort,
}: AuditLogTableProps) {
  const handleSort = (key: string) => {
    if (currentSort.sortBy === key) {
      onSort(key, currentSort.sortOrder === 'ASC' ? 'DESC' : 'ASC')
    } else {
      onSort(key, 'DESC')
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple mx-auto"></div>
        <p className="text-gray-400 mt-4">Loading audit logs...</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">No audit logs found</p>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-discord-lighter">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider',
                    column.sortable && 'cursor-pointer hover:text-white'
                  )}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {column.sortable && currentSort.sortBy === column.key && (
                      currentSort.sortOrder === 'ASC' ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-discord-lighter">
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="hover:bg-discord-lighter/50 transition-colors cursor-pointer"
                onClick={() => onRowClick(entry)}
              >
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-white font-medium">
                    {formatActionType(entry.actionType)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {entry.actorDisplayName || entry.actorName || entry.actorId || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm">
                    {/* Prefer enriched display name, then stored name, then ID */}
                    {entry.targetDisplayName ? (
                      <span className="text-white">{entry.targetDisplayName}</span>
                    ) : entry.targetName && entry.targetName !== entry.targetId ? (
                      <>
                        <span className="text-white">{entry.targetName}</span>
                        {entry.targetId && (
                          <span className="text-gray-500 text-xs ml-1 font-mono">
                            {entry.targetId}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-white">{entry.targetId || entry.targetName || '-'}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                      getSeverityColor(entry.severity)
                    )}
                  >
                    {entry.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {entry.success ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRowClick(entry)
                    }}
                    className="text-discord-blurple hover:text-discord-blurple/80 transition-colors"
                    title="View details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="px-4 py-3 border-t border-discord-lighter flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 text-sm bg-discord-darker border border-discord-lighter rounded hover:bg-discord-lighter disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
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
