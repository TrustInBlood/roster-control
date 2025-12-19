import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { seedingApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { CreateSessionRequest } from '../types/seeding'

export function useServers() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['seeding', 'servers'],
    queryFn: async () => {
      const response = await seedingApi.getServers()
      return response.data
    },
    enabled: !!user,
  })
}

export function useActiveSession() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['seeding', 'active'],
    queryFn: async () => {
      const response = await seedingApi.getActiveSession()
      return response.data
    },
    enabled: !!user,
    refetchInterval: 10000, // Refresh every 10 seconds for active session
  })
}

export function useSessionsList(params?: {
  page?: number
  limit?: number
  status?: string
}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['seeding', 'sessions', params],
    queryFn: async () => {
      const response = await seedingApi.listSessions(params)
      return response.data
    },
    enabled: !!user,
  })
}

export function useSession(id: number) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['seeding', 'session', id],
    queryFn: async () => {
      const response = await seedingApi.getSession(id)
      return response.data
    },
    enabled: !!user && !!id,
    refetchInterval: 10000, // Refresh every 10 seconds for session details
  })
}

export function useParticipants(
  sessionId: number,
  params?: {
    page?: number
    limit?: number
    status?: string
    participantType?: string
  }
) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['seeding', 'participants', sessionId, params],
    queryFn: async () => {
      const response = await seedingApi.getParticipants(sessionId, params)
      return response.data
    },
    enabled: !!user && !!sessionId,
    refetchInterval: 10000, // Refresh every 10 seconds
  })
}

export function useCreateSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreateSessionRequest) => seedingApi.createSession(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seeding'] })
    },
  })
}

export function useCloseSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => seedingApi.closeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seeding'] })
    },
  })
}

export function useCancelSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      seedingApi.cancelSession(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seeding'] })
    },
  })
}
