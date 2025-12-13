import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { discordApi, battlemetricsApi, membersApi } from '../lib/api'
import { useAuth } from './useAuth'
import type { MemberFilters, AddMemberRequest } from '../types/members'

/**
 * Hook to search Discord guild members
 * Debounce should be handled by the component calling this hook
 */
export function useDiscordMemberSearch(search: string, enabled: boolean = true) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['discord', 'members', 'search', search],
    queryFn: () => discordApi.searchMembers(search),
    enabled: enabled && !!user && search.length >= 2,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to get a single Discord member by ID
 */
export function useDiscordMember(userId: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['discord', 'member', userId],
    queryFn: () => discordApi.getMember(userId!),
    enabled: !!user && !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to lookup a player in BattleMetrics by Steam ID
 */
export function useBattleMetricsLookup(steamid: string, enabled: boolean = true) {
  const { user } = useAuth()

  // Only enable if it looks like a valid Steam ID (basic check)
  const isValidFormat = /^7656119\d{10}$/.test(steamid)

  return useQuery({
    queryKey: ['battlemetrics', 'player', steamid],
    queryFn: () => battlemetricsApi.lookupPlayer(steamid),
    enabled: enabled && !!user && isValidFormat,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false, // Don't retry if player not found
  })
}

/**
 * Hook to list members with pagination and filters
 */
export function useMembersList(filters: MemberFilters = {}) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['members', 'list', filters],
    queryFn: () => membersApi.list(filters),
    enabled: !!user,
  })
}

/**
 * Hook to get member details by Discord ID
 */
export function useMemberDetail(discordId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['members', 'detail', discordId],
    queryFn: () => membersApi.getDetail(discordId!),
    enabled: !!user && !!discordId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Hook to add a new member
 */
export function useAddMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: AddMemberRequest) => membersApi.add(request),
    onSuccess: () => {
      // Invalidate members list to refetch
      queryClient.invalidateQueries({ queryKey: ['members'] })
      // Also invalidate discord member searches as roles may have changed
      queryClient.invalidateQueries({ queryKey: ['discord', 'members'] })
    },
  })
}
