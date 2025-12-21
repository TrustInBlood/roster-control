import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { whitelistApi } from '../lib/api'
import { useAuth } from './useAuth'
import type {
  WhitelistFilters,
  GrantWhitelistRequest,
  RevokeWhitelistRequest,
  EditWhitelistRequest,
} from '../types/whitelist'

export function useWhitelistList(filters: WhitelistFilters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['whitelist', 'list', filters],
    queryFn: () => whitelistApi.list(filters),
    enabled: !!user,
  })
}

export function useWhitelistStats() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['whitelist', 'stats'],
    queryFn: whitelistApi.getStats,
    enabled: !!user,
  })
}

export function useWhitelistDetail(steamid64: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['whitelist', 'detail', steamid64],
    queryFn: () => whitelistApi.getDetail(steamid64),
    enabled: !!user && !!steamid64,
  })
}

export function useGrantWhitelist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: GrantWhitelistRequest) => whitelistApi.grant(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'profile'] })
    },
  })
}

export function useRevokeWhitelist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ steamid64, request }: { steamid64: string; request: RevokeWhitelistRequest }) =>
      whitelistApi.revoke(steamid64, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'profile'] })
    },
  })
}

export function useRevokeWhitelistEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      whitelistApi.revokeEntry(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'profile'] })
    },
  })
}

export function useEditWhitelistEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: EditWhitelistRequest }) =>
      whitelistApi.editEntry(id, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'profile'] })
    },
  })
}

export function useUpgradeConfidence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ steamid64, reason }: { steamid64: string; reason: string }) =>
      whitelistApi.upgradeConfidence(steamid64, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'whitelist'] })
      queryClient.invalidateQueries({ queryKey: ['players', 'profile'] })
    },
  })
}
