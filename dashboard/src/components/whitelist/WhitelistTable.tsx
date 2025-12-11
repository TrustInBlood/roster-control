import { Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, Copy, ExternalLink } from 'lucide-react'
import type { WhitelistEntry } from '../../types/whitelist'
import { cn, formatDate, formatRelativeTime, getStatusColor, getSourceColor, copyToClipboard } from '../../lib/utils'

interface WhitelistTableProps {
  entries: WhitelistEntry[]
  isLoading: boolean
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  onPageChange: (page: number) => void
  onSort: (sortBy: string, sortOrder: 'ASC' | 'DESC') => void
  currentSort: {
    sortBy: string
    sortOrder: 'ASC' | 'DESC'
  }
}

const columns = [
  { key: 'steamid64', label: 'Steam ID', sortable: true },
  { key: 'username', label: 'Username', sortable: true },
  { key: 'discord_username', label: 'Discord', sortable: true },
  { key: 'source', label: 'Source', sortable: true },
  { key: 'status', label: 'Status', sortable: false },
  { key: 'calculatedExpiration', label: 'Expires', sortable: false },
  { key: 'granted_at', label: 'Granted', sortable: true },
  { key: 'actions', label: '', sortable: false },
]

export default function WhitelistTable({
  entries,
  isLoading,
  pagination,
  onPageChange,
  onSort,
  currentSort,
}: WhitelistTableProps) {
  const handleSort = (key: string) => {
    if (currentSort.sortBy === key) {
      onSort(key, currentSort.sortOrder === 'ASC' ? 'DESC' : 'ASC')
    } else {
      onSort(key, 'DESC')
    }
  }

  const handleCopy = async (text: string) => {
    await copyToClipboard(text)
    // Could add a toast notification here
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple mx-auto"></div>
        <p className="text-gray-400 mt-4">Loading entries...</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">No whitelist entries found</p>
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
                className="hover:bg-discord-lighter/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-blue-400 font-mono">
                      {entry.steamid64}
                    </code>
                    <button
                      onClick={() => handleCopy(entry.steamid64)}
                      className="text-gray-500 hover:text-white transition-colors"
                      title="Copy Steam ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-white">
                    {entry.username || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {entry.discord_username || '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                      getSourceColor(entry.source)
                    )}
                  >
                    {entry.source || 'unknown'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                      getStatusColor(entry.status)
                    )}
                  >
                    {entry.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {entry.status === 'permanent'
                      ? 'Never'
                      : entry.calculatedExpiration
                      ? formatRelativeTime(entry.calculatedExpiration)
                      : '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-400">
                    {formatDate(entry.granted_at)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/whitelist/${entry.steamid64}`}
                    className="text-discord-blurple hover:text-discord-blurple/80 transition-colors"
                    title="View details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
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
