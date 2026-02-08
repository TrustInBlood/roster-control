import type { AccountLink, WhitelistEntry } from './whitelist'

// Player list item for the directory/search view
export interface PlayerListItem {
  steamid64: string
  username: string | null
  discord_username: string | null
  discord_user_id: string | null
  avatar_url: string | null
  isLinked: boolean
  eosID: string | null
  hasWhitelist: boolean
  whitelistStatus: 'active' | 'expired' | 'revoked' | 'permanent' | 'none'
  expiration: string | null
  isPermanent: boolean
  totalPlaytimeMinutes: number
  lastSeen: string | null
  joinCount: number
  isStaff: boolean
  source: 'role' | 'manual' | 'import' | 'donation' | null
  entryCount: number
}

// Extended account link with additional fields
export interface PlayerAccountLink extends AccountLink {
  created_at: string
}

// All links for a player
export interface PlayerLink {
  id: number
  discord_user_id: string
  steamid64: string
  eosID: string | null
  username: string | null
  confidence_score: number
  link_source: string
  is_primary: boolean
  created_at: string
}

// Discord information fetched from Discord API
export interface DiscordInfo {
  discord_user_id: string
  discord_username: string
  avatar_url?: string
  globalName?: string | null
  nickname?: string | null
  joinedAt?: string | null
  createdAt?: string | null
  bannerColor?: string | null
}

// Discord role info
export interface DiscordRole {
  id: string
  name: string
  color: string
}

// BattleMetrics player info
export interface BattleMetricsInfo {
  found: boolean
  playerId?: string
  playerName?: string | null
  profileUrl?: string
  error?: string | null
}

// Community Ban List active ban info
export interface CommunityBanListBan {
  id: string
  reason: string
  created: string
  expires: string | null
  banList: string
  organisation: string
}

// Community Ban List player info
export interface CommunityBanListInfo {
  found: boolean
  reputationPoints?: number
  riskRating?: number
  activeBansCount?: number
  expiredBansCount?: number
  activeBans?: CommunityBanListBan[]
  profileUrl?: string
  error?: string | null
}

// Activity summary from Player model
export interface PlayerActivity {
  totalPlaytimeMinutes: number
  joinCount: number
  lastSeen: string | null
  lastServerId: string | null
  firstSeen: string | null
}

// Whitelist summary for profile
export interface PlayerWhitelistSummary {
  hasWhitelist: boolean
  status: 'active' | 'expired' | 'revoked' | 'permanent' | 'none'
  expiration: string | null
  isPermanent: boolean
  entryCount: number
}

// Game stats from external stats API
export interface PlayerGameStats {
  kills: number
  deaths: number
  kdRatio: number
  teamkills: number
  revivesGiven: number
  revivesReceived: number
  nemesis: string | null
  lastSeen: string | null
  playerName: string | null
}

export interface PlayerGameStatsResponse {
  stats: PlayerGameStats
  statsResetAt: string | null
}

// Individual kill/death event from killfeed API
export interface KillfeedEntry {
  type: 'kill' | 'death'
  teamkill: boolean
  attacker: string
  attackerSteamId: string
  victim: string
  victimSteamId: string
  weapon: string
  serverId: string
  timestamp: string
}

export interface KillfeedResponse {
  steamId: string
  playerName: string
  count: number
  killfeed: KillfeedEntry[]
}

// Full player profile response
export interface PlayerProfile {
  steamid64: string
  eosID: string | null
  username: string | null
  discordLink: PlayerAccountLink | null
  potentialLink: PotentialLink | null
  allLinks: PlayerLink[]
  discordInfo: DiscordInfo | null
  discordRoles: DiscordRole[]
  battlemetrics: BattleMetricsInfo | null
  communityBanList: CommunityBanListInfo | null
  activity: PlayerActivity
  whitelist: PlayerWhitelistSummary
  isStaff: boolean
  staffRoles: string[]
  notes: string | null
  statsResetAt: string | null
}

// Linked account from Discord user (all Steam accounts linked to one Discord user)
export interface LinkedAccount {
  steamid64: string
  eosID: string | null
  username: string | null
  confidence_score: number
  link_source: string
  is_primary: boolean
  created_at: string
  totalPlaytimeMinutes: number
  lastSeen: string | null
  joinCount: number
  hasWhitelist: boolean
  whitelistStatus: 'active' | 'expired' | 'revoked' | 'permanent' | 'none'
}

// Session record
export interface PlayerSession {
  id: number
  serverId: string
  sessionStart: string
  sessionEnd: string | null
  durationMinutes: number | null
  isActive: boolean
}

// Seeding participation record
export interface SeedingParticipation {
  id: number
  sessionId: number
  sessionName: string | null
  participantType: 'switcher' | 'seeder'
  status: string
  targetPlaytimeMinutes: number
  totalRewardMinutes: number
  switchRewardedAt: string | null
  playtimeRewardedAt: string | null
  completionRewardedAt: string | null
  createdAt: string
}

// Duty status change record
export interface DutyStatusEntry {
  id: number
  status: boolean
  previousStatus: boolean
  source: string
  reason: string | null
  dutyType: 'admin' | 'tutor'
  success: boolean
  createdAt: string
}

// Audit log entry for player
export interface PlayerAuditLog {
  id: number
  actionType: string
  actorName: string
  actorId: string
  description: string
  success: boolean
  createdAt: string
  metadata: Record<string, unknown> | null
}

// Unlink history record
export interface UnlinkHistoryEntry {
  id: number
  steamid64: string
  eosID: string | null
  username: string | null
  reason: string | null
  unlinked_at: string
}

// Potential link metadata (from ticket extraction)
export interface PotentialLinkMetadata {
  ticketChannelId?: string
  ticketChannelName?: string
  messageId?: string
  extractedAt?: string
  originalMessage?: string
  [key: string]: unknown
}

// Discord info for a potential link
export interface PotentialLinkDiscordInfo {
  discord_user_id: string
  discord_username: string
  display_name: string
  avatar_url: string | null
  nickname: string | null
}

// Potential (unverified) link between Steam ID and Discord user
export interface PotentialLink {
  id: number
  discord_user_id: string
  steamid64: string
  username: string | null
  link_source: 'ticket' | 'manual' | 'whitelist'
  confidence_score: number
  metadata: PotentialLinkMetadata | null
  created_at: string
  updated_at: string | null
  discordInfo: PotentialLinkDiscordInfo | null
}

// Whitelist entry with calculated fields (reuse from whitelist.ts)
export type PlayerWhitelistEntry = WhitelistEntry

// API Response types
export interface PlayerListResponse {
  players: PlayerListItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface PlayerSessionsResponse {
  sessions: PlayerSession[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface PlayerAuditLogsResponse {
  logs: PlayerAuditLog[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface PlayerSeedingResponse {
  participations: SeedingParticipation[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface PlayerDutyResponse {
  changes: DutyStatusEntry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface PlayerWhitelistResponse {
  entries: PlayerWhitelistEntry[]
  summary: PlayerWhitelistSummary
}

export interface PlayerUnlinkResponse {
  history: UnlinkHistoryEntry[]
}

export interface LinkedAccountsResponse {
  accounts: LinkedAccount[]
}

export interface PotentialLinksResponse {
  potentialLinks: PotentialLink[]
}

export interface LinkAccountResponse {
  success: boolean
  link?: {
    discord_user_id: string
    steamid64: string
    confidence_score: number
    link_source: string
    is_primary: boolean
    created_at: string
  }
  created?: boolean
  previousConfidence?: number
  newConfidence?: number
  error?: string
}

// Filter types for player search
export interface PlayerFilters {
  page?: number
  limit?: number
  search?: string
  hasWhitelist?: boolean | string
  whitelistStatus?: 'active' | 'permanent' | 'expired' | 'revoked'
  isStaff?: boolean | string
  sortBy?: 'lastSeen' | 'username' | 'totalPlaytimeMinutes' | 'steamid64' | 'expiration'
  sortOrder?: 'ASC' | 'DESC'
}
