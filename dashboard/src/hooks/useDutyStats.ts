import { useQuery } from '@tanstack/react-query'
import { dutyApi } from '../lib/api'
import type { DutyPeriod, DutyType } from '../types/duty'

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
