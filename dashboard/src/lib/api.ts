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
  MemberDetail,
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
} from '../types/seeding'
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

  getDetail: async (discordId: string): Promise<MemberDetail> => {
    const { data } = await api.get<MemberDetail>(`/members/${discordId}`)
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
}

export default api
