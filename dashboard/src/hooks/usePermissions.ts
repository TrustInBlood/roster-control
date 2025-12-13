import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { permissionsApi } from '../lib/api'
import { useAuth } from './useAuth'

/**
 * Hook to fetch all permissions with their assigned roles
 */
export function usePermissions() {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => permissionsApi.list(),
    enabled: !!user && canManage,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to fetch available Discord roles for assignment
 */
export function useDiscordRoles() {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['permissions', 'roles'],
    queryFn: () => permissionsApi.getRoles(),
    enabled: !!user && canManage,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to fetch permission definitions
 */
export function usePermissionDefinitions() {
  const { user, hasPermission } = useAuth()
  const canManage = hasPermission('MANAGE_PERMISSIONS')

  return useQuery({
    queryKey: ['permissions', 'definitions'],
    queryFn: () => permissionsApi.getDefinitions(),
    enabled: !!user && canManage,
    staleTime: 1000 * 60 * 30, // 30 minutes (definitions rarely change)
  })
}

/**
 * Hook to update permission roles
 */
export function useUpdatePermission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ permissionName, roleIds }: { permissionName: string; roleIds: string[] }) =>
      permissionsApi.update(permissionName, { roleIds }),
    onSuccess: () => {
      // Invalidate permissions list to refresh
      queryClient.invalidateQueries({ queryKey: ['permissions'] })
    },
  })
}

/**
 * Hook to reset all permissions to defaults
 */
export function useResetPermissions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => permissionsApi.reset(),
    onSuccess: () => {
      // Invalidate permissions list to refresh
      queryClient.invalidateQueries({ queryKey: ['permissions'] })
    },
  })
}
