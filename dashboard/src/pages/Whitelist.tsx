import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, RefreshCw } from 'lucide-react'
import { useWhitelistList } from '../hooks/useWhitelist'
import WhitelistTable from '../components/whitelist/WhitelistTable'
import GrantModal from '../components/whitelist/GrantModal'
import type { WhitelistFilters } from '../types/whitelist'

export default function Whitelist() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showGrantModal, setShowGrantModal] = useState(false)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')

  const filters: WhitelistFilters = {
    page: parseInt(searchParams.get('page') || '1'),
    limit: parseInt(searchParams.get('limit') || '25'),
    source: searchParams.get('source') as WhitelistFilters['source'] || undefined,
    search: searchParams.get('search') || undefined,
    sortBy: searchParams.get('sortBy') || 'granted_at',
    sortOrder: (searchParams.get('sortOrder') as 'ASC' | 'DESC') || 'DESC',
    showExpired: searchParams.get('showExpired') === 'true',
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
      <div className="bg-discord-light rounded-lg p-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Steam ID, username, or Discord..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-discord-darker border border-discord-lighter rounded-md pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
              />
            </div>
          </form>

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

          {/* Show Expired Toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.showExpired || false}
              onChange={(e) => updateFilter('showExpired', e.target.checked ? 'true' : undefined)}
              className="rounded border-discord-lighter bg-discord-darker text-discord-blurple focus:ring-discord-blurple"
            />
            Show expired/revoked
          </label>

          {/* Clear Filters */}
          {(filters.source || filters.search || filters.showExpired) && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
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
