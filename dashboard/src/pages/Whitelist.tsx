import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, RefreshCw, Filter } from 'lucide-react'
import { useWhitelistList } from '../hooks/useWhitelist'
import WhitelistTable from '../components/whitelist/WhitelistTable'
import GrantModal from '../components/whitelist/GrantModal'
import type { WhitelistFilters } from '../types/whitelist'

export default function Whitelist() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showGrantModal, setShowGrantModal] = useState(false)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  const [showFilters, setShowFilters] = useState(false)

  const filters: WhitelistFilters = {
    page: parseInt(searchParams.get('page') || '1'),
    limit: parseInt(searchParams.get('limit') || '25'),
    source: searchParams.get('source') as WhitelistFilters['source'] || undefined,
    status: searchParams.get('status') as WhitelistFilters['status'] || undefined,
    search: searchParams.get('search') || undefined,
    sortBy: searchParams.get('sortBy') || 'granted_at',
    sortOrder: (searchParams.get('sortOrder') as 'ASC' | 'DESC') || 'DESC',
    showExpired: searchParams.get('showExpired') === 'true',
    expiringWithin: searchParams.get('expiringWithin') ? parseInt(searchParams.get('expiringWithin')!) : undefined,
  }

  const { data, isLoading, refetch, isFetching } = useWhitelistList(filters)

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

  const clearFilters = () => {
    setSearchInput('')
    setSearchParams({})
  }

  const hasActiveFilters = filters.source || filters.status || filters.search || filters.expiringWithin

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Whitelist Management</h1>
          <p className="text-gray-400 mt-1">
            {data?.pagination.total ?? 0} whitelisted players
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`bg-discord-lighter hover:bg-discord-light text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${showFilters ? 'ring-2 ring-discord-blurple' : ''}`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="bg-discord-blurple text-white text-xs px-1.5 py-0.5 rounded-full">
                !
              </span>
            )}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="bg-discord-lighter hover:bg-discord-light text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowGrantModal(true)}
            className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Grant Whitelist
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-discord-light rounded-lg p-4 space-y-4">
        {/* Search - always visible */}
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Steam ID, username, or Discord..."
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

        {/* Advanced Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-4 pt-4 border-t border-discord-lighter">
            {/* Status Filter */}
            <select
              value={filters.status || ''}
              onChange={(e) => updateFilter('status', e.target.value || undefined)}
              className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="permanent">Permanent</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>

            {/* Source Filter */}
            <select
              value={filters.source || ''}
              onChange={(e) => updateFilter('source', e.target.value || undefined)}
              className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="">All Sources</option>
              <option value="role">Role-based</option>
              <option value="manual">Manual</option>
              <option value="donation">Donation</option>
              <option value="import">Import</option>
            </select>

            {/* Expiring Soon Filter */}
            <select
              value={filters.expiringWithin?.toString() || ''}
              onChange={(e) => updateFilter('expiringWithin', e.target.value || undefined)}
              className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="">All Expirations</option>
              <option value="7">Expiring in 7 days</option>
              <option value="14">Expiring in 14 days</option>
              <option value="30">Expiring in 30 days</option>
              <option value="60">Expiring in 60 days</option>
              <option value="90">Expiring in 90 days</option>
            </select>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <WhitelistTable
          players={data?.entries ?? []}
          isLoading={isLoading}
          pagination={data?.pagination}
          onPageChange={(page) => updateFilter('page', page.toString())}
          onSort={(sortBy, sortOrder) => {
            const newParams = new URLSearchParams(searchParams)
            newParams.set('sortBy', sortBy)
            newParams.set('sortOrder', sortOrder)
            setSearchParams(newParams)
          }}
          currentSort={{
            sortBy: filters.sortBy || 'granted_at',
            sortOrder: filters.sortOrder || 'DESC',
          }}
        />
      </div>

      {/* Grant Modal */}
      {showGrantModal && (
        <GrantModal onClose={() => setShowGrantModal(false)} />
      )}
    </div>
  )
}
