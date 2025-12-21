import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, Shield } from 'lucide-react'
import type { PlayerListItem } from '../../types/player'
import { cn, formatRelativeTime, getStatusColor } from '../../lib/utils'
import CopyButton from '../ui/CopyButton'

interface PlayerTableProps {
  players: PlayerListItem[]
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
  { key: 'whitelistStatus', label: 'Status', sortable: false },
  { key: 'lastSeen', label: 'Last Seen', sortable: true },
  { key: 'totalPlaytimeMinutes', label: 'Playtime', sortable: true },
]

function formatPlaytime(minutes: number): string {
  if (minutes === 0) return '-'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export default function PlayerTable({
  players,
  isLoading,
  pagination,
  onPageChange,
  onSort,
  currentSort,
}: PlayerTableProps) {
  const navigate = useNavigate()

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
        <p className="text-gray-400 mt-4">Loading players...</p>
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">No players found</p>
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
            {players.map((player) => (
              <tr
                key={player.steamid64}
                className="hover:bg-discord-lighter/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/players/${player.steamid64}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-blue-400 font-mono">
                      {player.steamid64}
                    </code>
                    <span onClick={(e) => e.stopPropagation()}>
                      <CopyButton text={player.steamid64} size={3} />
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">
                      {player.username || '-'}
                    </span>
                    {player.isStaff && (
                      <span title="Staff">
                        <Shield className="w-4 h-4 text-discord-blurple" />
                      </span>
                    )}
                  </div>
                  {player.discord_username && (
                    <span className="text-xs text-gray-400">
                      {player.discord_username}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {player.whitelistStatus !== 'none' ? (
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                        getStatusColor(player.whitelistStatus)
                      )}
                    >
                      {player.whitelistStatus}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">No whitelist</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-300">
                    {player.lastSeen ? formatRelativeTime(player.lastSeen) : '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-400">
                    {formatPlaytime(player.totalPlaytimeMinutes)}
                  </span>
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
            {pagination.total} players
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
