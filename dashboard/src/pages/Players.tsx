import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Shield, Clock, User, Link2, Link2Off } from 'lucide-react'
import { usePlayersList } from '../hooks/usePlayers'
import GrantModal from '../components/whitelist/GrantModal'
import CopyButton from '../components/ui/CopyButton'
import { cn, formatRelativeTime } from '../lib/utils'
import type { PlayerListItem } from '../types/player'

export default function Players() {
  const navigate = useNavigate()
  const [showGrantModal, setShowGrantModal] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const { data, isLoading } = usePlayersList({
    search: searchQuery || undefined,
    limit: 10,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'permanent':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'expired':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
      case 'revoked':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  const hasSearched = searchQuery.length > 0

  const PlayerRow = ({ player }: { player: PlayerListItem }) => (
    <tr
      className="border-b border-discord-lighter hover:bg-discord-darker/50 transition-colors cursor-pointer"
      onClick={() => navigate(`/players/${player.steamid64}`)}
    >
      {/* Discord User */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {player.isLinked && player.avatar_url ? (
            <img
              src={player.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-discord-lighter flex items-center justify-center">
              <User className="w-4 h-4 text-gray-400" />
            </div>
          )}
          <div>
            {player.isLinked && player.discord_username ? (
              <p className="text-white font-medium">{player.discord_username}</p>
            ) : (
              <p className="text-gray-500">-</p>
            )}
          </div>
        </div>
      </td>

      {/* In-Game Name */}
      <td className="px-4 py-3">
        <span className="text-white">{player.username || '-'}</span>
      </td>

      {/* Steam ID */}
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

      {/* Linked Status */}
      <td className="px-4 py-3">
        {player.isLinked ? (
          <div className="flex items-center gap-1">
            <Link2 className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-sm">Yes</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Link2Off className="w-4 h-4 text-red-400" />
            <span className="text-red-400 text-sm">No</span>
          </div>
        )}
      </td>

      {/* Whitelist Status */}
      <td className="px-4 py-3">
        {player.hasWhitelist ? (
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
              getStatusColor(player.whitelistStatus)
            )}
          >
            {player.whitelistStatus}
          </span>
        ) : (
          <span className="text-gray-500 text-sm">None</span>
        )}
      </td>

      {/* Last Seen */}
      <td className="px-4 py-3">
        <span className="text-gray-400 text-sm">
          {player.lastSeen ? formatRelativeTime(player.lastSeen) : 'Never'}
        </span>
      </td>
    </tr>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Player Search</h1>
          <p className="text-gray-400 mt-1">
            Search for players by Steam ID, username, or Discord
          </p>
        </div>
        <button
          onClick={() => setShowGrantModal(true)}
          className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Grant Whitelist
        </button>
      </div>

      {/* Search */}
      <div className="bg-discord-light rounded-lg p-6">
        <form onSubmit={handleSearch} className="flex gap-4" autoComplete="off">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="search"
              placeholder="Enter Steam64 ID, username, or Discord username..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-discord-darker border border-discord-lighter rounded-md pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple text-lg"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
            />
          </div>
          <button
            type="submit"
            className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-6 py-3 rounded-md font-medium transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Results */}
      {hasSearched && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="bg-discord-light rounded-lg p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-discord-blurple mx-auto"></div>
              <p className="text-gray-400 mt-3">Searching...</p>
            </div>
          ) : data?.players && data.players.length > 0 ? (
            <>
              <p className="text-sm text-gray-400">
                Found {data.pagination.total} result{data.pagination.total !== 1 ? 's' : ''}
              </p>
              <div className="bg-discord-light rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-discord-darker">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Discord User
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          In-Game Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          Steam ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          <div className="flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            Linked
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          <div className="flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            Whitelist
                          </div>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Last Seen
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-discord-lighter">
                      {data.players.map((player) => (
                        <PlayerRow key={player.steamid64} player={player} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {data.pagination.total > 10 && (
                <p className="text-sm text-gray-500 text-center pt-2">
                  Showing first 10 results. Refine your search for more specific results.
                </p>
              )}
            </>
          ) : (
            <div className="bg-discord-light rounded-lg p-8 text-center">
              <Search className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No players found matching "{searchQuery}"</p>
              <p className="text-gray-500 text-sm mt-1">
                Try searching by Steam64 ID, in-game username, or Discord username
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty State - before search */}
      {!hasSearched && (
        <div className="bg-discord-light rounded-lg p-12 text-center">
          <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Search for a player</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Enter a Steam64 ID, in-game username, or Discord username to find a player's profile
          </p>
        </div>
      )}

      {/* Grant Modal */}
      {showGrantModal && (
        <GrantModal onClose={() => setShowGrantModal(false)} />
      )}
    </div>
  )
}
