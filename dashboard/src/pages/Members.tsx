import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { UserPlus, Search, Users, Link2, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useMembersList } from '../hooks/useMembers'
import { useAuth } from '../hooks/useAuth'
import AddMemberWizard from '../components/members/AddMemberWizard'
import CopyButton from '../components/ui/CopyButton'
import type { MemberFilters, Member } from '../types/members'
import { formatRelativeTime } from '../lib/utils'

export default function Members() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canAddMember = hasPermission('ADD_MEMBER')
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAddWizard, setShowAddWizard] = useState(false)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')

  const filters: MemberFilters = {
    page: parseInt(searchParams.get('page') || '1'),
    limit: parseInt(searchParams.get('limit') || '25'),
    search: searchParams.get('search') || undefined,
    sortBy: (searchParams.get('sortBy') as MemberFilters['sortBy']) || 'username',
    sortOrder: (searchParams.get('sortOrder') as 'ASC' | 'DESC') || 'ASC',
  }

  const { data, isLoading } = useMembersList(filters)

  const updateFilter = (key: string, value: string | undefined) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    // Reset to page 1 when changing filters
    if (key !== 'page') {
      newParams.set('page', '1')
    }
    setSearchParams(newParams)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilter('search', searchInput || undefined)
  }

  const handleSort = (column: MemberFilters['sortBy']) => {
    const newParams = new URLSearchParams(searchParams)
    if (filters.sortBy === column) {
      newParams.set('sortOrder', filters.sortOrder === 'ASC' ? 'DESC' : 'ASC')
    } else {
      newParams.set('sortBy', column!)
      newParams.set('sortOrder', 'ASC')
    }
    setSearchParams(newParams)
  }

  const SortableHeader = ({ column, children }: { column: MemberFilters['sortBy']; children: React.ReactNode }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {children}
        {filters.sortBy === column && (
          <span className="text-discord-blurple">
            {filters.sortOrder === 'ASC' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  )

  const MemberRow = ({ member }: { member: Member }) => (
    <tr
      className="border-b border-discord-lighter hover:bg-discord-darker/50 transition-colors cursor-pointer"
      onClick={() => navigate(`/members/${member.discord_user_id}`)}
    >
      {/* User */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src={member.avatarUrl}
            alt={member.username}
            className="w-8 h-8 rounded-full"
          />
          <div>
            <p className="text-white font-medium">{member.displayName}</p>
            <p className="text-gray-400 text-sm">@{member.username}</p>
          </div>
        </div>
      </td>

      {/* Nickname */}
      <td className="px-4 py-3">
        <span className="text-white">{member.nickname || '-'}</span>
      </td>

      {/* Steam ID */}
      <td className="px-4 py-3">
        {member.steamid64 ? (
          <div className="flex items-center gap-2">
            <code className="text-sm text-blue-400 font-mono">
              {member.steamid64}
            </code>
            <span onClick={(e) => e.stopPropagation()}>
              <CopyButton text={member.steamid64} size={3} />
            </span>
          </div>
        ) : (
          <span className="text-gray-500">Not linked</span>
        )}
      </td>

      {/* Link Status */}
      <td className="px-4 py-3">
        {member.steamid64 ? (
          <div className="flex items-center gap-1">
            <Link2 className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-sm">
              {member.confidence_score === 1 ? 'Full' : `${(member.confidence_score || 0) * 100}%`}
            </span>
          </div>
        ) : (
          <span className="text-gray-500 text-sm">-</span>
        )}
      </td>

      {/* BattleMetrics */}
      <td className="px-4 py-3">
        {member.steamid64 ? (
          <a
            href={`https://www.battlemetrics.com/rcon/players?filter[search]=${member.steamid64}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-discord-blurple hover:text-discord-blurple/80 transition-colors"
            title="Search on BattleMetrics"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        ) : (
          <span className="text-gray-500 text-sm">-</span>
        )}
      </td>

      {/* Joined */}
      <td className="px-4 py-3">
        <span className="text-gray-400 text-sm">
          {member.joinedAt ? formatRelativeTime(member.joinedAt) : '-'}
        </span>
      </td>
    </tr>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Members</h1>
          <p className="text-gray-400 mt-1">
            {data?.pagination.total ?? 0} members with member role
          </p>
        </div>
        {canAddMember && (
          <button
            onClick={() => setShowAddWizard(true)}
            className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add Member
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-discord-light rounded-lg p-4">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by username, nickname, or Steam ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-discord-darker border border-discord-lighter rounded-md pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
            />
          </div>
          <button
            type="submit"
            className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-discord-light rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-gray-400 animate-pulse mx-auto mb-2" />
            <p className="text-gray-400">Loading members...</p>
          </div>
        ) : data?.members && data.members.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-discord-darker">
                  <tr>
                    <SortableHeader column="username">User</SortableHeader>
                    <SortableHeader column="nickname">Nickname</SortableHeader>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Steam ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Link
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      BM
                    </th>
                    <SortableHeader column="joinedAt">Joined</SortableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-discord-lighter">
                  {data.members.map((member) => (
                    <MemberRow key={member.discord_user_id} member={member} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-discord-lighter">
                <div className="text-sm text-gray-400">
                  Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to{' '}
                  {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
                  {data.pagination.total} members
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateFilter('page', String(data.pagination.page - 1))}
                    disabled={data.pagination.page <= 1}
                    className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-400">
                    Page {data.pagination.page} of {data.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => updateFilter('page', String(data.pagination.page + 1))}
                    disabled={data.pagination.page >= data.pagination.totalPages}
                    className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-400">No members found</p>
            {filters.search && (
              <p className="text-gray-500 text-sm mt-1">
                Try adjusting your search criteria
              </p>
            )}
          </div>
        )}
      </div>

      {/* Add Member Wizard */}
      {showAddWizard && canAddMember && (
        <AddMemberWizard onClose={() => setShowAddWizard(false)} />
      )}
    </div>
  )
}
