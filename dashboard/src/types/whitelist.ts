export interface WhitelistEntry {
  id: number
  type: 'staff' | 'whitelist'
  steamid64: string
  eosID: string | null
  username: string | null
  discord_username: string | null
  discord_user_id: string | null
  group_id: number | null
  approved: boolean
  expiration: string | null
  duration_value: number | null
  duration_type: 'days' | 'months' | 'hours' | null
  reason: string | null
  granted_by: string | null
  granted_at: string
  revoked: boolean
  revoked_by: string | null
  revoked_reason: string | null
  revoked_at: string | null
  source: 'role' | 'manual' | 'import' | 'donation' | null
  role_name: string | null
  metadata: Record<string, unknown> | null
  // Calculated fields
  status: 'active' | 'expired' | 'revoked' | 'permanent'
  calculatedExpiration: string | null
  groupName: string | null
}

export interface WhitelistPlayer {
  steamid64: string
  username: string | null
  discord_username: string | null
  discord_user_id: string | null
  eosID: string | null
  status: 'active' | 'expired' | 'revoked' | 'permanent'
  expiration: string | null
  source: 'role' | 'manual' | 'import' | 'donation' | null
  entryCount: number
  latestGrantedAt: string
  groupName: string | null
}

export interface WhitelistStats {
  total: number
  active: number
  revoked: number
  bySource: Record<string, number>
}

export interface WhitelistUser {
  steamid64: string
  eosID: string | null
  username: string | null
  discord_username: string | null
  discord_user_id: string | null
}

export interface WhitelistCurrentStatus {
  isActive: boolean
  status: string
  expiration?: string | null
  isPermanent?: boolean
  totalDuration?: {
    months: number
    days: number
    hours: number
  }
}

export interface AccountLink {
  discord_user_id: string
  confidence_score: number
  link_source: string
  is_primary: boolean
}

export interface WhitelistDetailResponse {
  user: WhitelistUser
  currentStatus: WhitelistCurrentStatus
  accountLink: AccountLink | null
  history: WhitelistEntry[]
  entryCount: number
}

export interface WhitelistListResponse {
  entries: WhitelistPlayer[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface WhitelistFilters {
  page?: number
  limit?: number
  source?: 'role' | 'manual' | 'donation' | 'import'
  search?: string
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
  showExpired?: boolean
}

export interface GrantWhitelistRequest {
  steamid64: string
  eosID?: string
  username?: string
  discord_username?: string
  discord_user_id?: string
  reason: string
  duration_value: number | null
  duration_type: 'days' | 'months' | 'hours' | null
  note?: string
}

export interface ExtendWhitelistRequest {
  duration_value: number
  duration_type: 'days' | 'months' | 'hours'
  note?: string
}

export interface RevokeWhitelistRequest {
  reason: string
}

export interface EditWhitelistRequest {
  reason?: string
  duration_value?: number | null
  duration_type?: 'days' | 'months' | 'hours' | null
  note?: string
}
