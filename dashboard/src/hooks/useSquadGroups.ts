import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { squadGroupsApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { AddRoleRequest, UpdateRoleRequest } from '../types/squadgroups'

/**
 * Hook to fetch all squad group configurations
 */
export function useSquadGroups() {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['squadgroups'],
    queryFn: () => squadGroupsApi.list(),
    enabled: !!user && canManage,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to fetch available Discord roles for squad group assignment
 */
export function useSquadGroupRoles() {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['squadgroups', 'roles'],
    queryFn: () => squadGroupsApi.getRoles(),
    enabled: !!user && canManage,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to fetch a specific role's configuration
 */
export function useSquadGroupRole(roleId: string | null) {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['squadgroups', 'role', roleId],
    queryFn: () => squadGroupsApi.getRole(roleId!),
    enabled: !!user && canManage && !!roleId,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to add a new role to squad groups
 */
export function useAddSquadRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: AddRoleRequest) => squadGroupsApi.add(request),
    onSuccess: () => {
      // Invalidate squad groups list and roles to refresh
      queryClient.invalidateQueries({ queryKey: ['squadgroups'] })
    },
  })
}

/**
 * Hook to update a role's squad group configuration
 */
export function useUpdateSquadRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ roleId, request }: { roleId: string; request: UpdateRoleRequest }) =>
      squadGroupsApi.update(roleId, request),
    onSuccess: () => {
      // Invalidate squad groups list to refresh
      queryClient.invalidateQueries({ queryKey: ['squadgroups'] })
    },
  })
}

/**
 * Hook to remove a role from squad groups
 */
export function useRemoveSquadRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (roleId: string) => squadGroupsApi.remove(roleId),
    onSuccess: () => {
      // Invalidate squad groups list and roles to refresh
      queryClient.invalidateQueries({ queryKey: ['squadgroups'] })
    },
  })
}

/**
 * Hook to reset all squad groups to config defaults
 */
export function useResetSquadGroups() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => squadGroupsApi.reset(),
    onSuccess: () => {
      // Invalidate squad groups list to refresh
      queryClient.invalidateQueries({ queryKey: ['squadgroups'] })
    },
  })
}

/**
 * Hook to sync all members with tracked roles
 */
export function useSyncSquadGroups() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => squadGroupsApi.sync(),
    onSuccess: () => {
      // Invalidate squad groups list to refresh
      queryClient.invalidateQueries({ queryKey: ['squadgroups'] })
    },
  })
}
