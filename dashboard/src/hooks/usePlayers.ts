import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { playersApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { PlayerFilters } from '../types/player'

export function usePlayersList(filters: PlayerFilters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'list', filters],
    queryFn: () => playersApi.list(filters),
    enabled: !!user,
  })
}

export function usePlayerProfile(steamid64: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'profile', steamid64],
    queryFn: () => playersApi.getProfile(steamid64),
    enabled: !!user && !!steamid64,
  })
}

export function usePlayerSessions(steamid64: string, page = 1, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'sessions', steamid64, page],
    queryFn: () => playersApi.getSessions(steamid64, page),
    enabled: !!user && !!steamid64 && enabled,
  })
}

export function usePlayerAuditLogs(steamid64: string, page = 1, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'audit', steamid64, page],
    queryFn: () => playersApi.getAuditLogs(steamid64, page),
    enabled: !!user && !!steamid64 && enabled,
  })
}

export function usePlayerSeedingActivity(steamid64: string, page = 1, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'seeding', steamid64, page],
    queryFn: () => playersApi.getSeedingActivity(steamid64, page),
    enabled: !!user && !!steamid64 && enabled,
  })
}

export function usePlayerDutyHistory(steamid64: string, page = 1, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'duty', steamid64, page],
    queryFn: () => playersApi.getDutyHistory(steamid64, page),
    enabled: !!user && !!steamid64 && enabled,
  })
}

export function usePlayerWhitelistHistory(steamid64: string, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'whitelist', steamid64],
    queryFn: () => playersApi.getWhitelistHistory(steamid64),
    enabled: !!user && !!steamid64 && enabled,
  })
}

export function usePlayerUnlinkHistory(steamid64: string, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'unlinks', steamid64],
    queryFn: () => playersApi.getUnlinkHistory(steamid64),
    enabled: !!user && !!steamid64 && enabled,
  })
}

export function usePlayerLinkedAccounts(steamid64: string, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'linked-accounts', steamid64],
    queryFn: () => playersApi.getLinkedAccounts(steamid64),
    enabled: !!user && !!steamid64 && enabled,
  })
}

export function usePlayerPotentialLinks(steamid64: string, enabled = true) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['players', 'potential-links', steamid64],
    queryFn: () => playersApi.getPotentialLinks(steamid64),
    enabled: !!user && !!steamid64 && enabled,
  })
}

export function useLinkAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ steamid64, discordUserId, reason }: { steamid64: string; discordUserId: string; reason: string }) =>
      playersApi.linkAccount(steamid64, discordUserId, reason),
    onSuccess: (_data, variables) => {
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['players', 'profile', variables.steamid64] })
      queryClient.invalidateQueries({ queryKey: ['players', 'potential-links', variables.steamid64] })
      queryClient.invalidateQueries({ queryKey: ['players', 'linked-accounts', variables.steamid64] })
    },
  })
}

export function useResetPlayerStats() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ steamid64, reason }: { steamid64: string; reason: string }) =>
      playersApi.resetStats(steamid64, reason),
    onSuccess: (_data, variables) => {
      // Invalidate player profile to refresh stats reset date
      queryClient.invalidateQueries({ queryKey: ['players', 'profile', variables.steamid64] })
    },
  })
}
