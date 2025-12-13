import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, RefreshCw, Filter, Calendar } from 'lucide-react'
import { useAuditLogs, useAuditActionTypes } from '../hooks/useAudit'
import AuditLogTable from '../components/audit/AuditLogTable'
import AuditDetailModal from '../components/audit/AuditDetailModal'
import type { AuditLogFilters, AuditLogEntry } from '../types/audit'

export default function AuditLogs() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const filters: AuditLogFilters = {
    page: parseInt(searchParams.get('page') || '1'),
    limit: parseInt(searchParams.get('limit') || '25'),
    actionType: searchParams.get('actionType') || undefined,
    severity: searchParams.get('severity') || undefined,
    success: searchParams.get('success') || undefined,
    search: searchParams.get('search') || undefined,
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
    sortBy: searchParams.get('sortBy') || 'createdAt',
    sortOrder: (searchParams.get('sortOrder') as 'ASC' | 'DESC') || 'DESC',
  }

  const { data, isLoading, refetch, isFetching } = useAuditLogs(filters)
  const { data: actionTypesData } = useAuditActionTypes()

  const updateFilter = (key: string, value: string | undefined) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
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

  const hasActiveFilters = filters.actionType || filters.severity || filters.success || filters.search || filters.startDate || filters.endDate

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-gray-400 mt-1">
            {data?.pagination.total ?? 0} log entries
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
              placeholder="Search by actor, target, or description..."
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
            {/* Action Type */}
            <select
              value={filters.actionType || ''}
              onChange={(e) => updateFilter('actionType', e.target.value || undefined)}
              className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="">All Action Types</option>
              {actionTypesData?.actionTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>

            {/* Severity */}
            <select
              value={filters.severity || ''}
              onChange={(e) => updateFilter('severity', e.target.value || undefined)}
              className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="">All Severities</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>

            {/* Success/Failure */}
            <select
              value={filters.success || ''}
              onChange={(e) => updateFilter('success', e.target.value || undefined)}
              className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="">All Results</option>
              <option value="true">Successful</option>
              <option value="false">Failed</option>
            </select>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => updateFilter('startDate', e.target.value || undefined)}
                className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => updateFilter('endDate', e.target.value || undefined)}
                className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
              />
            </div>

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
        <AuditLogTable
          entries={data?.entries ?? []}
          isLoading={isLoading}
          pagination={data?.pagination}
          onPageChange={(page) => updateFilter('page', page.toString())}
          onRowClick={setSelectedEntry}
          onSort={(sortBy, sortOrder) => {
            const newParams = new URLSearchParams(searchParams)
            newParams.set('sortBy', sortBy)
            newParams.set('sortOrder', sortOrder)
            setSearchParams(newParams)
          }}
          currentSort={{
            sortBy: filters.sortBy || 'createdAt',
            sortOrder: filters.sortOrder || 'DESC',
          }}
        />
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <AuditDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  )
}
