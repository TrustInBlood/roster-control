import { useState } from 'react'
import { RefreshCw, BarChart3, List } from 'lucide-react'
import { useDutyLeaderboard, useDutySummary } from '../hooks/useDutyStats'
import { DutyFilters, DutyLeaderboard, DutySummaryCards } from '../components/duty'
import type { DutyPeriod, DutyType } from '../types/duty'

type ViewMode = 'leaderboard' | 'summary'

export default function DutyStats() {
  const [period, setPeriod] = useState<DutyPeriod>('week')
  const [dutyType, setDutyType] = useState<DutyType>('both')
  const [viewMode, setViewMode] = useState<ViewMode>('leaderboard')

  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    refetch: refetchLeaderboard,
    isFetching: leaderboardFetching,
  } = useDutyLeaderboard(period, dutyType)

  const {
    data: summaryData,
    isLoading: summaryLoading,
    refetch: refetchSummary,
    isFetching: summaryFetching,
  } = useDutySummary(period, dutyType)

  const isLoading = viewMode === 'leaderboard' ? leaderboardLoading : summaryLoading
  const isFetching = viewMode === 'leaderboard' ? leaderboardFetching : summaryFetching

  const handleRefresh = () => {
    if (viewMode === 'leaderboard') {
      refetchLeaderboard()
    } else {
      refetchSummary()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Duty Stats</h1>
          <p className="text-gray-400 mt-1">
            Track staff duty time and performance
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="bg-discord-lighter hover:bg-discord-light text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters and View Toggle */}
      <div className="bg-discord-light rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <DutyFilters
            period={period}
            dutyType={dutyType}
            onPeriodChange={setPeriod}
            onDutyTypeChange={setDutyType}
          />

          {/* View Toggle */}
          <div className="flex items-center bg-discord-darker rounded-lg p-1">
            <button
              onClick={() => setViewMode('leaderboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'leaderboard'
                  ? 'bg-discord-blurple text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
              Leaderboard
            </button>
            <button
              onClick={() => setViewMode('summary')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'summary'
                  ? 'bg-discord-blurple text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Summary
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'leaderboard' ? (
        <DutyLeaderboard
          entries={leaderboardData?.data?.entries || []}
          isLoading={isLoading}
        />
      ) : (
        <DutySummaryCards
          stats={summaryData?.data}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
