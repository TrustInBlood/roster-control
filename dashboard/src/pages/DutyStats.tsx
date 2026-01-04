import { useState } from 'react'
import { RefreshCw, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStaffOverview } from '../hooks/useDutyStats'
import { DutySummaryCards, StaffOverview } from '../components/duty'
import { useAuth } from '../hooks/useAuth'
import type { StaffOverviewSortBy, DutySummaryStats } from '../types/duty'

export default function DutyStats() {
  const [staffOverviewSort, setStaffOverviewSort] = useState<StaffOverviewSortBy>('points')
  const { hasPermission } = useAuth()
  const canManageSettings = hasPermission('MANAGE_DUTY_SETTINGS')

  const {
    data: staffOverviewData,
    isLoading: staffOverviewLoading,
    refetch: refetchStaffOverview,
    isFetching: staffOverviewFetching,
  } = useStaffOverview(staffOverviewSort)

  const handleRefresh = () => {
    refetchStaffOverview()
  }

  // Build summary stats from staff overview data
  const summaryStats: DutySummaryStats | undefined = staffOverviewData?.data?.entries
    ? {
        period: 'all-time',
        dutyType: 'both',
        totalUsers: staffOverviewData.data.entries.length,
        totalTime: staffOverviewData.data.entries.reduce((sum, e) => sum + e.totalDutyMinutes * 60 * 1000, 0),
        totalSessions: staffOverviewData.data.entries.reduce((sum, e) => sum + e.totalSessions, 0),
        averageTimePerUser: staffOverviewData.data.entries.length > 0
          ? staffOverviewData.data.entries.reduce((sum, e) => sum + e.totalDutyMinutes * 60 * 1000, 0) / staffOverviewData.data.entries.length
          : 0,
        averageSessionsPerUser: staffOverviewData.data.entries.length > 0
          ? staffOverviewData.data.entries.reduce((sum, e) => sum + e.totalSessions, 0) / staffOverviewData.data.entries.length
          : 0,
        currentlyOnDuty: 0, // Not tracked in lifetime stats
        topPerformers: staffOverviewData.data.entries.slice(0, 3).map(e => ({
          discordUserId: e.discordUserId,
          discordUsername: e.displayName,
          displayName: e.displayName,
          avatarUrl: e.avatarUrl,
          totalTime: e.totalDutyMinutes * 60 * 1000,
        })),
      }
    : undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Duty Stats</h1>
          <p className="text-gray-400 mt-1">
            All-time staff activity including off-duty contributions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canManageSettings && (
            <Link
              to="/admin/duty-settings"
              className="bg-discord-lighter hover:bg-discord-light text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
          )}
          <button
            onClick={handleRefresh}
            disabled={staffOverviewFetching}
            className="bg-discord-lighter hover:bg-discord-light text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${staffOverviewFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <DutySummaryCards
        stats={summaryStats}
        isLoading={staffOverviewLoading}
      />

      {/* Staff Overview Table */}
      <StaffOverview
        entries={staffOverviewData?.data?.entries || []}
        isLoading={staffOverviewLoading}
        sortBy={staffOverviewSort}
        onSortChange={setStaffOverviewSort}
        hideHeader
      />
    </div>
  )
}
