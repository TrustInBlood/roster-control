import { useState } from 'react'
import { RefreshCw, Settings, Calendar } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStaffOverview } from '../hooks/useDutyStats'
import { DutySummaryCards, StaffOverview } from '../components/duty'
import { useAuth } from '../hooks/useAuth'
import type { StaffOverviewSortBy, StaffOverviewSortOrder, StaffOverviewPeriod, DutySummaryStats } from '../types/duty'
import { STAFF_OVERVIEW_PERIOD_LABELS } from '../types/duty'

export default function DutyStats() {
  const [staffOverviewSort, setStaffOverviewSort] = useState<StaffOverviewSortBy>('points')
  const [staffOverviewSortOrder, setStaffOverviewSortOrder] = useState<StaffOverviewSortOrder>('desc')
  const [period, setPeriod] = useState<StaffOverviewPeriod>('week')
  const { hasPermission } = useAuth()
  const canManageSettings = hasPermission('MANAGE_DUTY_SETTINGS')

  const {
    data: staffOverviewData,
    isLoading: staffOverviewLoading,
    refetch: refetchStaffOverview,
    isFetching: staffOverviewFetching,
  } = useStaffOverview(staffOverviewSort, staffOverviewSortOrder, period)

  const handleSortChange = (field: StaffOverviewSortBy) => {
    if (field === staffOverviewSort) {
      setStaffOverviewSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')
    } else {
      setStaffOverviewSort(field)
      setStaffOverviewSortOrder('desc')
    }
  }

  const handleRefresh = () => {
    refetchStaffOverview()
  }

  // Build summary stats from staff overview data
  const summaryStats: DutySummaryStats | undefined = staffOverviewData?.data?.entries
    ? {
        period: staffOverviewData.data.period === 'week' ? 'week' : 'month',
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
        currentlyOnDuty: staffOverviewData.data.currentlyOnDuty ?? 0,
        topPerformers: [],
      }
    : undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Duty Stats</h1>
          <p className="text-gray-400 mt-1">
            Staff activity including off-duty contributions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-discord-lighter rounded-md px-3 py-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as StaffOverviewPeriod)}
              className="bg-transparent text-white text-sm font-medium focus:outline-none cursor-pointer"
            >
              {(Object.keys(STAFF_OVERVIEW_PERIOD_LABELS) as StaffOverviewPeriod[]).map((p) => (
                <option key={p} value={p} className="bg-discord-dark">
                  {STAFF_OVERVIEW_PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
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
        sortOrder={staffOverviewSortOrder}
        onSortChange={handleSortChange}
        hideHeader
      />
    </div>
  )
}
