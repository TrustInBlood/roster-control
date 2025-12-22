import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dutySettingsApi } from '../lib/api'
import { useAuth } from './useAuth'

export function useDutySettings() {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('MANAGE_DUTY_SETTINGS')

  return useQuery({
    queryKey: ['dutySettings'],
    queryFn: () => dutySettingsApi.get(),
    enabled: !!user && canView,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useUpdateDutySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: Record<string, boolean | number | string | string[]>) => dutySettingsApi.update(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dutySettings'] })
    },
  })
}

export function useDutySettingsAudit(limit = 50) {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('MANAGE_DUTY_SETTINGS')

  return useQuery({
    queryKey: ['dutySettings', 'audit', limit],
    queryFn: () => dutySettingsApi.getAuditLog(limit),
    enabled: !!user && canView,
    staleTime: 1000 * 60, // 1 minute
  })
}

export function useResetDutySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => dutySettingsApi.reset(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dutySettings'] })
    },
  })
}
