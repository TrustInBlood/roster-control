import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { infoButtonsApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { CreateInfoButtonRequest, UpdateInfoButtonRequest } from '../types/infoButtons'

/**
 * Hook to fetch all info buttons
 */
export function useInfoButtons() {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('MANAGE_INFO_BUTTONS')

  return useQuery({
    queryKey: ['info-buttons'],
    queryFn: () => infoButtonsApi.list(),
    enabled: !!user && canView,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to fetch a single info button
 */
export function useInfoButton(id: number | null) {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('MANAGE_INFO_BUTTONS')

  const validId = id !== null && !Number.isNaN(id) ? id : null

  return useQuery({
    queryKey: ['info-buttons', 'detail', validId],
    queryFn: () => infoButtonsApi.get(validId!),
    enabled: !!user && canView && validId !== null,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to create a new info button
 */
export function useCreateInfoButton() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreateInfoButtonRequest) => infoButtonsApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['info-buttons'] })
    },
  })
}

/**
 * Hook to update an info button
 */
export function useUpdateInfoButton() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateInfoButtonRequest }) =>
      infoButtonsApi.update(id, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['info-buttons'] })
      queryClient.invalidateQueries({ queryKey: ['info-buttons', 'detail', variables.id] })
    },
  })
}

/**
 * Hook to delete an info button
 */
export function useDeleteInfoButton() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => infoButtonsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['info-buttons'] })
    },
  })
}

/**
 * Hook to reorder info buttons
 */
export function useReorderInfoButtons() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (order: Array<{ id: number; display_order: number }>) =>
      infoButtonsApi.reorder(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['info-buttons'] })
    },
  })
}

/**
 * Hook to reload the whitelist post with updated buttons
 * @param recreate - If true, deletes and recreates the post (use if post is missing or broken)
 */
export function useReloadInfoPost() {
  return useMutation({
    mutationFn: (recreate: boolean = false) => infoButtonsApi.reloadPost(recreate),
  })
}
