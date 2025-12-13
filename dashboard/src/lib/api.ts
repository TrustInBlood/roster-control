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

export default api
