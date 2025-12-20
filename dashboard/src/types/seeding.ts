export type SessionStatus = 'active' | 'completed' | 'cancelled'
export type ParticipantType = 'switcher' | 'seeder'
export type ParticipantStatus = 'on_source' | 'seeder' | 'switched' | 'playtime_met' | 'completed'
export type RewardUnit = 'days' | 'months'

export interface RewardConfig {
  value: number
  unit: RewardUnit
  thresholdMinutes?: number // Only for playtime reward
}

export interface RewardsConfig {
  switch: RewardConfig | null
  playtime: (RewardConfig & { thresholdMinutes: number }) | null
  completion: RewardConfig | null
}

export interface SeedingSessionMetadata {
  testMode?: boolean
  cancellation_reason?: string
  [key: string]: unknown
}

export interface SeedingSession {
  id: number
  target_server_id: string
  target_server_name: string | null
  player_threshold: number
  status: SessionStatus
  switch_reward_value: number | null
  switch_reward_unit: RewardUnit | null
  playtime_reward_value: number | null
  playtime_reward_unit: RewardUnit | null
  playtime_threshold_minutes: number | null
  completion_reward_value: number | null
  completion_reward_unit: RewardUnit | null
  source_server_ids: string[]
  started_at: string
  closed_at: string | null
  started_by: string | null
  started_by_name: string | null
  participants_count: number
  rewards_granted_count: number
  metadata: SeedingSessionMetadata | null
  createdAt: string
  updatedAt: string
}

export interface SeedingSessionWithStats extends SeedingSession {
  stats: {
    byTypeAndStatus: Array<{
      participant_type: ParticipantType
      status: ParticipantStatus
      count: number
    }>
    currentlyOnTarget: number
  }
}

export interface SeedingParticipant {
  id: number
  session_id: number
  player_id: number | null
  steam_id: string
  username: string | null
  participant_type: ParticipantType
  source_server_id: string | null
  source_join_time: string | null
  source_leave_time: string | null
  target_join_time: string | null
  target_leave_time: string | null
  target_playtime_minutes: number
  status: ParticipantStatus
  confirmation_sent: boolean
  switch_rewarded_at: string | null
  playtime_rewarded_at: string | null
  completion_rewarded_at: string | null
  total_reward_minutes: number
  is_on_target: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ServerInfo {
  id: string
  name: string
  connected: boolean
  playerCount: number
  isFull: boolean
  maxPlayers: number
}

export interface CreateSessionRequest {
  targetServerId: string
  playerThreshold: number
  rewards: RewardsConfig
  testMode?: boolean
  sourceServerIds?: string[] // Only used in test mode - manually specify source servers
}

export interface SessionsListResponse {
  sessions: SeedingSession[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface ParticipantsListResponse {
  participants: SeedingParticipant[]
  total: number
  page: number
  limit: number
  pages: number
}

// Close preview response - shows what will happen when completing a session
export interface ClosePreviewResponse {
  sessionId: number
  participantsToReward: number
  completionRewardDays: number
  totalWhitelistDaysToGrant: number
  sessionConfig: {
    completionReward: string | null
  }
}

// Response when reversing all rewards for a session
export interface ReverseRewardsResponse {
  revokedCount: number
  participantsAffected: number
  message: string
}

// Response when revoking rewards for a single participant
export interface RevokeParticipantRewardsResponse {
  revokedCount: number
  rewardsCleared: {
    switch: boolean
    playtime: boolean
    completion: boolean
  }
  message: string
}
