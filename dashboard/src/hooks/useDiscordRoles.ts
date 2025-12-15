import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { discordRolesApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { CreateGroupRequest, UpdateGroupRequest, CreateRoleRequest, UpdateRoleRequest, BatchCreateRolesRequest } from '../types/discordroles'

/**
 * Hook to fetch all Discord roles and groups
 */
export function useDiscordRoles() {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['discordroles'],
    queryFn: () => discordRolesApi.list(),
    enabled: !!user && canManage,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to fetch all groups
 */
export function useDiscordRoleGroups() {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['discordroles', 'groups'],
    queryFn: () => discordRolesApi.getGroups(),
    enabled: !!user && canManage,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to fetch a specific group with its roles
 */
export function useDiscordRoleGroup(groupId: number | null) {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['discordroles', 'group', groupId],
    queryFn: () => discordRolesApi.getGroup(groupId!),
    enabled: !!user && canManage && groupId !== null,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to fetch available Discord roles (not yet tracked)
 */
export function useAvailableDiscordRoles() {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['discordroles', 'available'],
    queryFn: () => discordRolesApi.getAvailable(),
    enabled: !!user && canManage,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to create a new group
 */
export function useCreateDiscordRoleGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreateGroupRequest) => discordRolesApi.createGroup(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discordroles'] })
    },
  })
}

/**
 * Hook to update a group
 */
export function useUpdateDiscordRoleGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ groupId, request }: { groupId: number; request: UpdateGroupRequest }) =>
      discordRolesApi.updateGroup(groupId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discordroles'] })
    },
  })
}

/**
 * Hook to delete a group
 */
export function useDeleteDiscordRoleGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (groupId: number) => discordRolesApi.deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discordroles'] })
    },
  })
}

/**
 * Hook to create a new role
 */
export function useCreateDiscordRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreateRoleRequest) => discordRolesApi.createRole(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discordroles'] })
    },
  })
}

/**
 * Hook to update a role
 */
export function useUpdateDiscordRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ roleId, request }: { roleId: string; request: UpdateRoleRequest }) =>
      discordRolesApi.updateRole(roleId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discordroles'] })
    },
  })
}

/**
 * Hook to delete a role
 */
export function useDeleteDiscordRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (roleId: string) => discordRolesApi.deleteRole(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discordroles'] })
    },
  })
}

/**
 * Hook to batch create multiple roles at once
 */
export function useBatchCreateDiscordRoles() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: BatchCreateRolesRequest) => discordRolesApi.batchCreate(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discordroles'] })
    },
  })
}

/**
 * Hook to reset all Discord roles to config defaults
 */
export function useResetDiscordRoles() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => discordRolesApi.reset(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discordroles'] })
    },
  })
}
