import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { statsTemplatesApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { UpdateTemplateRequest, CreateRoleMappingRequest } from '../types/statsTemplates'

/**
 * Hook to fetch all stats templates
 */
export function useStatsTemplates(activeOnly?: boolean) {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('VIEW_STATS_TEMPLATES')

  return useQuery({
    queryKey: ['stats-templates', { activeOnly }],
    queryFn: () => statsTemplatesApi.list(activeOnly),
    enabled: !!user && canView,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to fetch a single template's details
 */
export function useStatsTemplate(id: number | null) {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('VIEW_STATS_TEMPLATES')

  // Guard against NaN and null
  const validId = id !== null && !Number.isNaN(id) ? id : null

  return useQuery({
    queryKey: ['stats-templates', 'detail', validId],
    queryFn: () => statsTemplatesApi.getDetail(validId!),
    enabled: !!user && canView && validId !== null,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to create a new template
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (formData: FormData) => statsTemplatesApi.create(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats-templates'] })
    },
  })
}

/**
 * Hook to update a template's config
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, request }: { id: number; request: UpdateTemplateRequest }) =>
      statsTemplatesApi.update(id, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stats-templates'] })
      queryClient.invalidateQueries({ queryKey: ['stats-templates', 'detail', variables.id] })
    },
  })
}

/**
 * Hook to update a template's image
 */
export function useUpdateTemplateImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, formData }: { id: number; formData: FormData }) =>
      statsTemplatesApi.updateImage(id, formData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stats-templates'] })
      queryClient.invalidateQueries({ queryKey: ['stats-templates', 'detail', variables.id] })
    },
  })
}

/**
 * Hook to delete a template
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => statsTemplatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats-templates'] })
    },
  })
}

/**
 * Hook to set a template as default
 */
export function useSetDefaultTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => statsTemplatesApi.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats-templates'] })
    },
  })
}

/**
 * Hook to fetch role mappings
 */
export function useRoleMappings() {
  const { user, hasPermission } = useAuth()
  const canView = hasPermission('VIEW_STATS_TEMPLATES')

  return useQuery({
    queryKey: ['stats-templates', 'role-mappings'],
    queryFn: () => statsTemplatesApi.getRoleMappings(),
    enabled: !!user && canView,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to create a role mapping
 */
export function useCreateRoleMapping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreateRoleMappingRequest) => statsTemplatesApi.createRoleMapping(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats-templates', 'role-mappings'] })
    },
  })
}

/**
 * Hook to delete a role mapping
 */
export function useDeleteRoleMapping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (roleId: string) => statsTemplatesApi.deleteRoleMapping(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats-templates', 'role-mappings'] })
    },
  })
}

/**
 * Hook to refresh template cache
 */
export function useRefreshTemplateCache() {
  return useMutation({
    mutationFn: () => statsTemplatesApi.refreshCache(),
  })
}

/**
 * Hook to seed templates from config
 */
export function useSeedTemplates() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => statsTemplatesApi.seed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats-templates'] })
    },
  })
}
