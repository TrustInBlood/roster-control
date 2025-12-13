export interface DiscordMember {
  id: string
  username: string
  displayName: string
  globalName: string | null
  avatar: string | null
  avatarUrl: string
  roles: string[]
}

export interface DiscordMemberDetail extends DiscordMember {
  nickname: string | null
  joinedAt: string | null
}

export interface BattleMetricsPlayer {
  found: boolean
  profileUrl: string | null
  playerData: {
    id: string
    name: string
    steamId: string
  } | null
  error?: string
}

export interface AddMemberRequest {
  discord_user_id: string
  steamid64: string
  nickname: string
  battlemetrics_player_id: string | null
}

export interface AddMemberResponse {
  success: boolean
  member: {
    discord_user_id: string
    steamid64: string
    username: string
    nickname: string
  }
  results: {
    linkCreated: boolean
    linkUpdated: boolean
    roleAdded: boolean
    alreadyHadRole: boolean
    nicknameSet: boolean
    flagAdded: 'added' | 'already_has' | 'failed' | 'skipped'
  }
  errors: string[]
}

export interface Member {
  discord_user_id: string
  username: string
  displayName: string
  nickname: string | null
  avatarUrl: string
  steamid64: string | null
  linked_at: string | null
  confidence_score: number | null
  joinedAt: string | null
}

export interface MemberRole {
  id: string
  name: string
  color: string
}

export interface MemberLink {
  steamid64: string
  eosID: string | null
  confidence_score: number
  link_source: string
  linked_at: string | null
  metadata: Record<string, unknown> | null
}

export interface MemberBattleMetrics {
  found: boolean
  playerId?: string
  playerName?: string | null
  profileUrl?: string
  error?: string
}

export interface MemberDetail {
  discord_user_id: string
  username: string
  displayName: string
  globalName: string | null
  nickname: string | null
  avatarUrl: string
  bannerColor: string | null
  joinedAt: string | null
  createdAt: string | null
  isMember: boolean
  roles: MemberRole[]
  link: MemberLink | null
  battlemetrics: MemberBattleMetrics | null
}

export interface MemberFilters {
  page?: number
  limit?: number
  search?: string
  sortBy?: 'username' | 'nickname' | 'linked_at' | 'joinedAt'
  sortOrder?: 'ASC' | 'DESC'
}

export interface MembersListResponse {
  members: Member[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface DiscordMembersSearchResponse {
  members: DiscordMember[]
}

// Wizard step types
export type WizardStep = 1 | 2 | 3 | 4

export interface WizardState {
  step: WizardStep
  selectedUser: DiscordMember | null
  steamId: string
  battlemetricsData: BattleMetricsPlayer | null
  nickname: string
  isSubmitting: boolean
  result: AddMemberResponse | null
}
