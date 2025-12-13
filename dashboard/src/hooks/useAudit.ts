import { useQuery } from '@tanstack/react-query'
import { startOfDay, endOfDay, parseISO } from 'date-fns'
import { auditApi, securityApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { AuditLogFilters } from '../types/audit'

// Convert date strings to local timezone ISO strings
function convertDatesToLocalTimezone(filters: AuditLogFilters): AuditLogFilters {
  const converted = { ...filters }

  if (filters.startDate) {
    // Parse the date string and get start of day in local timezone
    const date = parseISO(filters.startDate)
    converted.startDate = startOfDay(date).toISOString()
  }

  if (filters.endDate) {
    // Parse the date string and get end of day in local timezone
    const date = parseISO(filters.endDate)
    converted.endDate = endOfDay(date).toISOString()
  }

  return converted
}

export function useAuditLogs(filters: AuditLogFilters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['audit', 'list', filters],
    queryFn: () => auditApi.list(convertDatesToLocalTimezone(filters)),
    enabled: !!user,
  })
}

export function useAuditStats(hours?: number) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['audit', 'stats', hours],
    queryFn: () => auditApi.getStats(hours),
    enabled: !!user,
  })
}

export function useAuditActionTypes() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['audit', 'action-types'],
    queryFn: () => auditApi.getActionTypes(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
}

export function useAuditActors() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['audit', 'actors'],
    queryFn: () => auditApi.getActors(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
}

export function useAuditDetail(actionId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['audit', 'detail', actionId],
    queryFn: () => auditApi.getDetail(actionId!),
    enabled: !!user && !!actionId,
  })
}

export function useUnlinkedStaff() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['security', 'unlinked-staff'],
    queryFn: () => securityApi.getUnlinkedStaff(),
    enabled: !!user,
    staleTime: 60 * 1000, // Cache for 1 minute
  })
}
