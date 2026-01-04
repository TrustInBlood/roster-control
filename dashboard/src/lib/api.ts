import axios from 'axios'
import type { User } from '../types/auth'
import type {
  WhitelistListResponse,
  WhitelistDetailResponse,
  WhitelistStats,
  WhitelistFilters,
  GrantWhitelistRequest,
  ExtendWhitelistRequest,
  RevokeWhitelistRequest,
  EditWhitelistRequest,
  WhitelistEntry,
} from '../types/whitelist'
import type {
  AuditLogListResponse,
  AuditLogFilters,
  AuditLogStats,
  AuditLogDetailResponse,
  UnlinkedStaffResponse,
} from '../types/audit'
import type {
  DiscordMembersSearchResponse,
  DiscordMemberDetail,
  BattleMetricsPlayer,
  AddMemberRequest,
  AddMemberResponse,
  MembersListResponse,
  MemberFilters,
  MemberRolesResponse,
} from '../types/members'
import type {
  PermissionsListResponse,
  DiscordRolesResponse,
  PermissionDefinitionsResponse,
  UpdatePermissionRequest,
  UpdatePermissionResponse,
  ResetPermissionsResponse,
} from '../types/permissions'
import type {
  SquadGroupsListResponse,
  DiscordRolesForSquadResponse,
  RoleConfigResponse,
  AddRoleRequest,
  AddRoleResponse,
  UpdateRoleRequest,
  UpdateRoleResponse,
  RemoveRoleResponse,
  ResetSquadGroupsResponse,
} from '../types/squadgroups'
import type {
  SeedingSession,
  SeedingSessionWithStats,
  ServerInfo,
  CreateSessionRequest,
  SessionsListResponse,
  ParticipantsListResponse,
  ClosePreviewResponse,
  ReverseRewardsResponse,
  RevokeParticipantRewardsResponse,
} from '../types/seeding'
import type {
  PlayerListResponse,
  PlayerProfile,
  PlayerSessionsResponse,
  PlayerAuditLogsResponse,
  PlayerSeedingResponse,
  PlayerDutyResponse,
  PlayerWhitelistResponse,
  PlayerUnlinkResponse,
  LinkedAccountsResponse,
  PotentialLinksResponse,
  LinkAccountResponse,
  PlayerFilters,
} from '../types/player'
import type {
  StatsTemplatesListResponse,
  StatsTemplateDetailResponse,
  RoleMappingsListResponse,
  UpdateTemplateRequest,
  UpdateTemplateResponse,
  DeleteTemplateResponse,
  SetDefaultTemplateResponse,
  CreateRoleMappingRequest,
  CreateRoleMappingResponse,
  DeleteRoleMappingResponse,
  RefreshCacheResponse,
  SeedTemplatesResponse,
} from '../types/statsTemplates'
import type {
  DutyPeriod,
  DutyType,
  DutyLeaderboardResponse,
  DutySummaryResponse,
  DutyUserStatsResponse,
  DutySessionsResponse,
  DutySessionResponse,
  StaffOverviewSortBy,
  StaffOverviewPeriod,
  StaffOverviewResponse,
} from '../types/duty'
import type {
  DutySettingsResponse,
  UpdateDutySettingsResponse,
  DutySettingsAuditResponse,
  ResetDutySettingsResponse,
} from '../types/dutySettings'
import type {
  CreateInfoButtonRequest,
  UpdateInfoButtonRequest,
  InfoButtonsListResponse,
  InfoButtonResponse,
  InfoButtonMutationResponse,
} from '../types/infoButtons'
import type {
  UserPreferencesResponse,
  UpdatePreferencesResponse,
  PartialUserPreferences,
} from '../types/preferences'

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor to handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const errorCode = error.response?.data?.code

    // Handle 401 (not authenticated) - redirect to login
    if (status === 401) {
      // Only redirect if not already on auth endpoints
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/api/v1/auth/login'
      }
      return Promise.reject(error)
    }

    // Handle 403 (permission denied)
    if (status === 403) {
      // NOT_STAFF means they lost their staff role entirely
      if (errorCode === 'NOT_STAFF') {
        window.location.href = '/access-denied'
        return Promise.reject(error)
      }

      // Any other 403 (PERMISSION_DENIED or unknown) - redirect to dashboard
      // This handles role changes where user is still logged in but lost permissions
      if (!window.location.pathname.startsWith('/dashboard')) {
        window.location.href = '/dashboard?error=permission_denied'
      }
      return Promise.reject(error)
    }

    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  getMe: async (): Promise<User> => {
    const { data } = await api.get<User>('/auth/me')
    return data
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout')
  },

  getLoginUrl: () => '/api/v1/auth/login',
}

// Whitelist API
export const whitelistApi = {
  list: async (filters: WhitelistFilters = {}): Promise<WhitelistListResponse> => {
    const { data } = await api.get<WhitelistListResponse>('/whitelist', {
      params: filters,
    })
    return data
  },

  getStats: async (): Promise<WhitelistStats> => {
    const { data } = await api.get<WhitelistStats>('/whitelist/stats')
    return data
  },

  getDetail: async (steamid64: string): Promise<WhitelistDetailResponse> => {
    const { data } = await api.get<WhitelistDetailResponse>(`/whitelist/${steamid64}`)
    return data
  },

  grant: async (request: GrantWhitelistRequest): Promise<{ success: boolean; entry: WhitelistEntry }> => {
    const { data } = await api.post<{ success: boolean; entry: WhitelistEntry }>('/whitelist', request)
    return data
  },

  extend: async (id: number, request: ExtendWhitelistRequest): Promise<{ success: boolean; entry: WhitelistEntry }> => {
    const { data } = await api.put<{ success: boolean; entry: WhitelistEntry }>(`/whitelist/${id}/extend`, request)
    return data
  },

  revoke: async (steamid64: string, request: RevokeWhitelistRequest): Promise<{ success: boolean; revokedCount: number; message: string }> => {
    const { data } = await api.post<{ success: boolean; revokedCount: number; message: string }>(`/whitelist/${steamid64}/revoke`, request)
    return data
  },

  revokeEntry: async (id: number, reason?: string): Promise<{ success: boolean; message: string; entry: WhitelistEntry }> => {
    const { data } = await api.post<{ success: boolean; message: string; entry: WhitelistEntry }>(`/whitelist/entry/${id}/revoke`, { reason })
    return data
  },

  editEntry: async (id: number, request: EditWhitelistRequest): Promise<{ success: boolean; entry: WhitelistEntry }> => {
    const { data } = await api.put<{ success: boolean; entry: WhitelistEntry }>(`/whitelist/entry/${id}`, request)
    return data
  },

  upgradeConfidence: async (steamid64: string, reason: string): Promise<{
    success: boolean
    previousConfidence: number
    newConfidence: number
    message: string
  }> => {
    const { data } = await api.post<{
      success: boolean
      previousConfidence: number
      newConfidence: number
      message: string
    }>(`/whitelist/${steamid64}/upgrade-confidence`, { reason })
    return data
  },
}

// Audit API
export const auditApi = {
  list: async (filters: AuditLogFilters = {}): Promise<AuditLogListResponse> => {
    const { data } = await api.get<AuditLogListResponse>('/audit', {
      params: filters,
    })
    return data
  },

  getStats: async (hours?: number): Promise<AuditLogStats> => {
    const { data } = await api.get<AuditLogStats>('/audit/stats', {
      params: hours ? { hours } : undefined,
    })
    return data
  },

  getActionTypes: async (): Promise<{ actionTypes: string[] }> => {
    const { data } = await api.get<{ actionTypes: string[] }>('/audit/action-types')
    return data
  },

  getActors: async (): Promise<{ actors: { actorId: string; displayName: string }[] }> => {
    const { data } = await api.get<{ actors: { actorId: string; displayName: string }[] }>('/audit/actors')
    return data
  },

  getDetail: async (actionId: string): Promise<AuditLogDetailResponse> => {
    const { data } = await api.get<AuditLogDetailResponse>(`/audit/${actionId}`)
    return data
  },
}

// Security API
export const securityApi = {
  getUnlinkedStaff: async (): Promise<UnlinkedStaffResponse> => {
    const { data } = await api.get<UnlinkedStaffResponse>('/security/unlinked-staff')
    return data
  },
}

// Discord API
export const discordApi = {
  searchMembers: async (search: string): Promise<DiscordMembersSearchResponse> => {
    const { data } = await api.get<DiscordMembersSearchResponse>('/discord/members', {
      params: { search },
    })
    return data
  },

  getMember: async (userId: string): Promise<{ member: DiscordMemberDetail }> => {
    const { data } = await api.get<{ member: DiscordMemberDetail }>(`/discord/member/${userId}`)
    return data
  },
}

// BattleMetrics API
export const battlemetricsApi = {
  lookupPlayer: async (steamid: string): Promise<BattleMetricsPlayer> => {
    const { data } = await api.get<BattleMetricsPlayer>(`/battlemetrics/player/${steamid}`)
    return data
  },
}

// Members API
export const membersApi = {
  list: async (filters: MemberFilters = {}): Promise<MembersListResponse> => {
    const { data } = await api.get<MembersListResponse>('/members', {
      params: filters,
    })
    return data
  },

  getRoles: async (): Promise<MemberRolesResponse> => {
    const { data } = await api.get<MemberRolesResponse>('/members/roles')
    return data
  },

  add: async (request: AddMemberRequest): Promise<AddMemberResponse> => {
    const { data } = await api.post<AddMemberResponse>('/members', request)
    return data
  },
}

// Permissions API
export const permissionsApi = {
  list: async (): Promise<PermissionsListResponse> => {
    const { data } = await api.get<PermissionsListResponse>('/permissions')
    return data
  },

  getRoles: async (): Promise<DiscordRolesResponse> => {
    const { data } = await api.get<DiscordRolesResponse>('/permissions/roles')
    return data
  },

  getDefinitions: async (): Promise<PermissionDefinitionsResponse> => {
    const { data } = await api.get<PermissionDefinitionsResponse>('/permissions/definitions')
    return data
  },

  update: async (permissionName: string, request: UpdatePermissionRequest): Promise<UpdatePermissionResponse> => {
    const { data } = await api.put<UpdatePermissionResponse>(`/permissions/${permissionName}`, request)
    return data
  },

  reset: async (): Promise<ResetPermissionsResponse> => {
    const { data } = await api.post<ResetPermissionsResponse>('/permissions/seed', {
      confirm: 'RESET_ALL_PERMISSIONS',
    })
    return data
  },
}

// Squad Groups API
export const squadGroupsApi = {
  list: async (): Promise<SquadGroupsListResponse> => {
    const { data } = await api.get<SquadGroupsListResponse>('/squadgroups')
    return data
  },

  getRoles: async (): Promise<DiscordRolesForSquadResponse> => {
    const { data } = await api.get<DiscordRolesForSquadResponse>('/squadgroups/roles')
    return data
  },

  getRole: async (roleId: string): Promise<RoleConfigResponse> => {
    const { data } = await api.get<RoleConfigResponse>(`/squadgroups/${roleId}`)
    return data
  },

  add: async (request: AddRoleRequest): Promise<AddRoleResponse> => {
    const { data } = await api.post<AddRoleResponse>('/squadgroups', request)
    return data
  },

  update: async (roleId: string, request: UpdateRoleRequest): Promise<UpdateRoleResponse> => {
    const { data } = await api.put<UpdateRoleResponse>(`/squadgroups/${roleId}`, request)
    return data
  },

  remove: async (roleId: string): Promise<RemoveRoleResponse> => {
    const { data } = await api.delete<RemoveRoleResponse>(`/squadgroups/${roleId}`)
    return data
  },

  reset: async (): Promise<ResetSquadGroupsResponse> => {
    const { data } = await api.post<ResetSquadGroupsResponse>('/squadgroups/seed', {
      confirm: 'RESET_ALL_SQUADGROUPS',
    })
    return data
  },

  sync: async (): Promise<{ success: boolean; synced: number; updated: number; errors: number; message: string }> => {
    const { data } = await api.post<{ success: boolean; synced: number; updated: number; errors: number; message: string }>('/squadgroups/sync')
    return data
  },
}

// Stats Templates API
export const statsTemplatesApi = {
  list: async (activeOnly?: boolean): Promise<StatsTemplatesListResponse> => {
    const { data } = await api.get<StatsTemplatesListResponse>('/stats-templates', {
      params: activeOnly ? { active: 'true' } : undefined,
    })
    return data
  },

  getDetail: async (id: number): Promise<StatsTemplateDetailResponse> => {
    const { data } = await api.get<StatsTemplateDetailResponse>(`/stats-templates/${id}`)
    return data
  },

  create: async (formData: FormData): Promise<{ success: boolean; template: StatsTemplateDetailResponse['template'] }> => {
    const { data } = await api.post<{ success: boolean; template: StatsTemplateDetailResponse['template'] }>('/stats-templates', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data
  },

  update: async (id: number, request: UpdateTemplateRequest): Promise<UpdateTemplateResponse> => {
    const { data } = await api.put<UpdateTemplateResponse>(`/stats-templates/${id}`, request)
    return data
  },

  updateImage: async (id: number, formData: FormData): Promise<UpdateTemplateResponse> => {
    const { data } = await api.put<UpdateTemplateResponse>(`/stats-templates/${id}/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return data
  },

  delete: async (id: number): Promise<DeleteTemplateResponse> => {
    const { data } = await api.delete<DeleteTemplateResponse>(`/stats-templates/${id}`)
    return data
  },

  setDefault: async (id: number): Promise<SetDefaultTemplateResponse> => {
    const { data } = await api.post<SetDefaultTemplateResponse>(`/stats-templates/${id}/set-default`)
    return data
  },

  getImageUrl: (id: number): string => {
    return `/api/v1/stats-templates/${id}/image`
  },

  // Role mappings
  getRoleMappings: async (): Promise<RoleMappingsListResponse> => {
    const { data } = await api.get<RoleMappingsListResponse>('/stats-templates/role-mappings')
    return data
  },

  createRoleMapping: async (request: CreateRoleMappingRequest): Promise<CreateRoleMappingResponse> => {
    const { data } = await api.post<CreateRoleMappingResponse>('/stats-templates/role-mappings', request)
    return data
  },

  deleteRoleMapping: async (roleId: string): Promise<DeleteRoleMappingResponse> => {
    const { data } = await api.delete<DeleteRoleMappingResponse>(`/stats-templates/role-mappings/${roleId}`)
    return data
  },

  // Cache management
  refreshCache: async (): Promise<RefreshCacheResponse> => {
    const { data } = await api.post<RefreshCacheResponse>('/stats-templates/refresh-cache')
    return data
  },

  seed: async (): Promise<SeedTemplatesResponse> => {
    const { data } = await api.post<SeedTemplatesResponse>('/stats-templates/seed')
    return data
  },
}

// Players API
export const playersApi = {
  list: async (filters: PlayerFilters = {}): Promise<PlayerListResponse> => {
    const { data } = await api.get<PlayerListResponse>('/players', {
      params: filters,
    })
    return data
  },

  getProfile: async (steamid64: string): Promise<PlayerProfile> => {
    const { data } = await api.get<PlayerProfile>(`/players/${steamid64}`)
    return data
  },

  getSessions: async (steamid64: string, page = 1, limit = 10): Promise<PlayerSessionsResponse> => {
    const { data } = await api.get<PlayerSessionsResponse>(`/players/${steamid64}/sessions`, {
      params: { page, limit },
    })
    return data
  },

  getAuditLogs: async (steamid64: string, page = 1, limit = 10): Promise<PlayerAuditLogsResponse> => {
    const { data } = await api.get<PlayerAuditLogsResponse>(`/players/${steamid64}/audit`, {
      params: { page, limit },
    })
    return data
  },

  getSeedingActivity: async (steamid64: string, page = 1, limit = 10): Promise<PlayerSeedingResponse> => {
    const { data } = await api.get<PlayerSeedingResponse>(`/players/${steamid64}/seeding`, {
      params: { page, limit },
    })
    return data
  },

  getDutyHistory: async (steamid64: string, page = 1, limit = 10): Promise<PlayerDutyResponse> => {
    const { data } = await api.get<PlayerDutyResponse>(`/players/${steamid64}/duty`, {
      params: { page, limit },
    })
    return data
  },

  getWhitelistHistory: async (steamid64: string): Promise<PlayerWhitelistResponse> => {
    const { data } = await api.get<PlayerWhitelistResponse>(`/players/${steamid64}/whitelist`)
    return data
  },

  getUnlinkHistory: async (steamid64: string): Promise<PlayerUnlinkResponse> => {
    const { data } = await api.get<PlayerUnlinkResponse>(`/players/${steamid64}/unlinks`)
    return data
  },

  getLinkedAccounts: async (steamid64: string): Promise<LinkedAccountsResponse> => {
    const { data } = await api.get<LinkedAccountsResponse>(`/players/${steamid64}/linked-accounts`)
    return data
  },

  getPotentialLinks: async (steamid64: string): Promise<PotentialLinksResponse> => {
    const { data } = await api.get<PotentialLinksResponse>(`/players/${steamid64}/potential-links`)
    return data
  },

  linkAccount: async (steamid64: string, discordUserId: string, reason: string): Promise<LinkAccountResponse> => {
    const { data } = await api.post<LinkAccountResponse>(`/players/${steamid64}/link`, { discordUserId, reason })
    return data
  },
}

// Seeding API
export const seedingApi = {
  getServers: async (): Promise<{ success: boolean; data: ServerInfo[] }> => {
    const { data } = await api.get<{ success: boolean; data: ServerInfo[] }>('/seeding/servers')
    return data
  },

  listSessions: async (params?: {
    page?: number
    limit?: number
    status?: string
    sortBy?: string
    sortOrder?: string
  }): Promise<{ success: boolean; data: SessionsListResponse }> => {
    const { data } = await api.get<{ success: boolean; data: SessionsListResponse }>('/seeding/sessions', { params })
    return data
  },

  getActiveSession: async (): Promise<{ success: boolean; data: SeedingSessionWithStats | null }> => {
    const { data } = await api.get<{ success: boolean; data: SeedingSessionWithStats | null }>('/seeding/sessions/active')
    return data
  },

  getSession: async (id: number): Promise<{ success: boolean; data: SeedingSessionWithStats }> => {
    const { data } = await api.get<{ success: boolean; data: SeedingSessionWithStats }>(`/seeding/sessions/${id}`)
    return data
  },

  getParticipants: async (
    sessionId: number,
    params?: {
      page?: number
      limit?: number
      status?: string
      participantType?: string
      sortBy?: string
      sortOrder?: string
    }
  ): Promise<{ success: boolean; data: ParticipantsListResponse }> => {
    const { data } = await api.get<{ success: boolean; data: ParticipantsListResponse }>(
      `/seeding/sessions/${sessionId}/participants`,
      { params }
    )
    return data
  },

  createSession: async (request: CreateSessionRequest): Promise<{ success: boolean; data: SeedingSession }> => {
    const { data } = await api.post<{ success: boolean; data: SeedingSession }>('/seeding/sessions', request)
    return data
  },

  closeSession: async (id: number): Promise<{ success: boolean; data: SeedingSession }> => {
    const { data } = await api.post<{ success: boolean; data: SeedingSession }>(`/seeding/sessions/${id}/close`)
    return data
  },

  cancelSession: async (id: number, reason?: string): Promise<{ success: boolean; data: SeedingSession }> => {
    const { data } = await api.post<{ success: boolean; data: SeedingSession }>(`/seeding/sessions/${id}/cancel`, { reason })
    return data
  },

  getClosePreview: async (id: number): Promise<{ success: boolean; data: ClosePreviewResponse }> => {
    const { data } = await api.get<{ success: boolean; data: ClosePreviewResponse }>(`/seeding/sessions/${id}/close-preview`)
    return data
  },

  reverseRewards: async (id: number, reason?: string): Promise<{ success: boolean; data: ReverseRewardsResponse }> => {
    const { data } = await api.post<{ success: boolean; data: ReverseRewardsResponse }>(`/seeding/sessions/${id}/reverse-rewards`, { reason })
    return data
  },

  revokeParticipantRewards: async (
    sessionId: number,
    participantId: number,
    reason?: string
  ): Promise<{ success: boolean; data: RevokeParticipantRewardsResponse }> => {
    const { data } = await api.post<{ success: boolean; data: RevokeParticipantRewardsResponse }>(
      `/seeding/sessions/${sessionId}/participants/${participantId}/revoke-rewards`,
      { reason }
    )
    return data
  },
}

// Duty Stats API
export const dutyApi = {
  getLeaderboard: async (
    period: DutyPeriod = 'week',
    dutyType: DutyType = 'both',
    limit = 25
  ): Promise<DutyLeaderboardResponse> => {
    const { data } = await api.get<DutyLeaderboardResponse>('/duty/leaderboard', {
      params: { period, type: dutyType, limit },
    })
    return data
  },

  getSummary: async (
    period: DutyPeriod = 'week',
    dutyType: DutyType = 'both'
  ): Promise<DutySummaryResponse> => {
    const { data } = await api.get<DutySummaryResponse>('/duty/summary', {
      params: { period, type: dutyType },
    })
    return data
  },

  getUserStats: async (
    discordId: string,
    period: DutyPeriod = 'week',
    dutyType: DutyType = 'both'
  ): Promise<DutyUserStatsResponse> => {
    const { data } = await api.get<DutyUserStatsResponse>(`/duty/user/${discordId}`, {
      params: { period, type: dutyType },
    })
    return data
  },

  getSessions: async (
    status: 'all' | 'active' = 'all',
    dutyType?: DutyType,
    limit = 50
  ): Promise<DutySessionsResponse> => {
    const { data } = await api.get<DutySessionsResponse>('/duty/sessions', {
      params: { status, type: dutyType, limit },
    })
    return data
  },

  getSession: async (id: number): Promise<DutySessionResponse> => {
    const { data } = await api.get<DutySessionResponse>(`/duty/sessions/${id}`)
    return data
  },

  extendSession: async (id: number): Promise<{ success: boolean; message: string }> => {
    const { data } = await api.post<{ success: boolean; message: string }>(`/duty/sessions/${id}/extend`)
    return data
  },

  getStaffOverview: async (
    sortBy: StaffOverviewSortBy = 'points',
    period: StaffOverviewPeriod = 'week'
  ): Promise<StaffOverviewResponse> => {
    const { data } = await api.get<StaffOverviewResponse>('/duty/staff-overview', {
      params: { sortBy, period },
    })
    return data
  },
}

// Duty Settings API
export const dutySettingsApi = {
  get: async (): Promise<DutySettingsResponse> => {
    const { data } = await api.get<DutySettingsResponse>('/duty/settings')
    return data
  },

  update: async (updates: Record<string, boolean | number | string | string[]>): Promise<UpdateDutySettingsResponse> => {
    const { data } = await api.put<UpdateDutySettingsResponse>('/duty/settings', { updates })
    return data
  },

  getAuditLog: async (limit = 50): Promise<DutySettingsAuditResponse> => {
    const { data } = await api.get<DutySettingsAuditResponse>('/duty/settings/audit', {
      params: { limit },
    })
    return data
  },

  reset: async (): Promise<ResetDutySettingsResponse> => {
    const { data } = await api.post<ResetDutySettingsResponse>('/duty/settings/reset', {
      confirm: 'RESET_DUTY_SETTINGS',
    })
    return data
  },
}

// Info Buttons API
export const infoButtonsApi = {
  list: async (): Promise<InfoButtonsListResponse> => {
    const { data } = await api.get<InfoButtonsListResponse>('/info-buttons')
    return data
  },

  get: async (id: number): Promise<InfoButtonResponse> => {
    const { data } = await api.get<InfoButtonResponse>(`/info-buttons/${id}`)
    return data
  },

  create: async (request: CreateInfoButtonRequest): Promise<InfoButtonMutationResponse> => {
    const { data } = await api.post<InfoButtonMutationResponse>('/info-buttons', request)
    return data
  },

  update: async (id: number, request: UpdateInfoButtonRequest): Promise<InfoButtonMutationResponse> => {
    const { data } = await api.put<InfoButtonMutationResponse>(`/info-buttons/${id}`, request)
    return data
  },

  delete: async (id: number): Promise<InfoButtonMutationResponse> => {
    const { data } = await api.delete<InfoButtonMutationResponse>(`/info-buttons/${id}`)
    return data
  },

  reorder: async (order: Array<{ id: number; display_order: number }>): Promise<InfoButtonMutationResponse> => {
    const { data } = await api.put<InfoButtonMutationResponse>('/info-buttons/reorder', { order })
    return data
  },

  reloadPost: async (recreate = false): Promise<InfoButtonMutationResponse> => {
    const { data } = await api.post<InfoButtonMutationResponse>('/info-buttons/reload-post', { recreate })
    return data
  },
}

// User Preferences API
export const userPreferencesApi = {
  get: async (): Promise<UserPreferencesResponse> => {
    const { data } = await api.get<UserPreferencesResponse>('/user/preferences')
    return data
  },

  update: async (preferences: PartialUserPreferences): Promise<UpdatePreferencesResponse> => {
    const { data } = await api.put<UpdatePreferencesResponse>('/user/preferences', { preferences })
    return data
  },
}

export default api
