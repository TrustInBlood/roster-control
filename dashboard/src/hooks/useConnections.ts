import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { connectionsApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { CreateServerRequest, UpdateServerRequest } from '../types/connections'

export function useConnectionServers() {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('MANAGE_CONNECTIONS')

  return useQuery({
    queryKey: ['connections', 'servers'],
    queryFn: () => connectionsApi.getServers(),
    enabled: !!user && canView,
    refetchInterval: 15000,
  })
}

export function useConnectionSettings() {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('MANAGE_CONNECTIONS')

  return useQuery({
    queryKey: ['connections', 'settings'],
    queryFn: () => connectionsApi.getSettings(),
    enabled: !!user && canView,
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpdateConnectionSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: Record<string, boolean | number | string>) => connectionsApi.updateSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'settings'] })
    },
  })
}

export function useCreateServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreateServerRequest) => connectionsApi.createServer(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'servers'] })
    },
  })
}

export function useUpdateServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, data }: { key: string; data: UpdateServerRequest }) =>
      connectionsApi.updateServer(key, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'servers'] })
    },
  })
}

export function useDeleteServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (key: string) => connectionsApi.deleteServer(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'servers'] })
    },
  })
}

export function useReconnectServer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (key: string) => connectionsApi.reconnectServer(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'servers'] })
    },
  })
}

export function useDbStatus() {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('MANAGE_CONNECTIONS')

  return useQuery({
    queryKey: ['connections', 'db-status'],
    queryFn: () => connectionsApi.getDbStatus(),
    enabled: !!user && canView,
    refetchInterval: 30000,
  })
}

export function useConnectionAudit(limit = 50) {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('MANAGE_CONNECTIONS')

  return useQuery({
    queryKey: ['connections', 'audit', limit],
    queryFn: () => connectionsApi.getAuditLog(limit),
    enabled: !!user && canView,
    staleTime: 1000 * 60,
  })
}
