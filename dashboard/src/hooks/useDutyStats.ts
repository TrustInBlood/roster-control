import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dutyApi } from '../lib/api'
import type { DutyPeriod, DutyType, StaffOverviewSortBy, StaffOverviewPeriod } from '../types/duty'
import { useAuth } from './useAuth'

export function useDutyLeaderboard(
  period: DutyPeriod = 'week',
  dutyType: DutyType = 'both',
  limit = 25
) {
  return useQuery({
    queryKey: ['duty', 'leaderboard', period, dutyType, limit],
    queryFn: () => dutyApi.getLeaderboard(period, dutyType, limit),
    staleTime: 60 * 1000, // 1 minute
  })
}

export function useDutySummary(
  period: DutyPeriod = 'week',
  dutyType: DutyType = 'both'
) {
  return useQuery({
    queryKey: ['duty', 'summary', period, dutyType],
    queryFn: () => dutyApi.getSummary(period, dutyType),
    staleTime: 60 * 1000, // 1 minute
  })
}

export function useDutyUserStats(
  discordId: string | undefined,
  period: DutyPeriod = 'week',
  dutyType: DutyType = 'both'
) {
  return useQuery({
    queryKey: ['duty', 'user', discordId, period, dutyType],
    queryFn: () => dutyApi.getUserStats(discordId!, period, dutyType),
    enabled: !!discordId,
    staleTime: 60 * 1000, // 1 minute
  })
}

export function useDutySessions(
  status: 'all' | 'active' = 'all',
  dutyType?: DutyType,
  limit = 50
) {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('VIEW_DUTY')

  return useQuery({
    queryKey: ['duty', 'sessions', status, dutyType, limit],
    queryFn: () => dutyApi.getSessions(status, dutyType, limit),
    enabled: !!user && canView,
    staleTime: 30 * 1000, // 30 seconds for active sessions
    refetchInterval: status === 'active' ? 60 * 1000 : false, // Auto-refresh active sessions
  })
}

export function useActiveSessions(dutyType?: DutyType) {
  return useDutySessions('active', dutyType, 100)
}

export function useExtendSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: number) => dutyApi.extendSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duty', 'sessions'] })
    },
  })
}

export function useStaffOverview(
  sortBy: StaffOverviewSortBy = 'points',
  period: StaffOverviewPeriod = 'week',
  limit = 50
) {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('VIEW_DUTY')

  return useQuery({
    queryKey: ['duty', 'staff-overview', sortBy, period, limit],
    queryFn: () => dutyApi.getStaffOverview(sortBy, period, limit),
    enabled: !!user && canView,
    staleTime: 60 * 1000, // 1 minute
  })
}
