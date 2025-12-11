import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { whitelistApi } from '../lib/api'
import type {
  WhitelistFilters,
  GrantWhitelistRequest,
  ExtendWhitelistRequest,
  RevokeWhitelistRequest,
} from '../types/whitelist'

export function useWhitelistList(filters: WhitelistFilters = {}) {
  return useQuery({
    queryKey: ['whitelist', 'list', filters],
    queryFn: () => whitelistApi.list(filters),
  })
}

export function useWhitelistStats() {
  return useQuery({
    queryKey: ['whitelist', 'stats'],
    queryFn: whitelistApi.getStats,
  })
}

export function useWhitelistDetail(steamid64: string) {
  return useQuery({
    queryKey: ['whitelist', 'detail', steamid64],
    queryFn: () => whitelistApi.getDetail(steamid64),
    enabled: !!steamid64,
  })
}

export function useGrantWhitelist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: GrantWhitelistRequest) => whitelistApi.grant(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelist'] })
    },
  })
}

export function useExtendWhitelist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: ExtendWhitelistRequest }) =>
      whitelistApi.extend(id, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whitelist'] })
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
    },
  })
}
