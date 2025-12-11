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
  WhitelistEntry,
} from '../types/whitelist'

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

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
}

export default api
