import { useQuery } from '@tanstack/react-query'
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
