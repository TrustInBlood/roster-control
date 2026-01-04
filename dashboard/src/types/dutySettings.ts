// Duty Settings Types - Matches backend DutyTrackingConfig format

export type ConfigType = 'boolean' | 'number' | 'string' | 'json'

export interface ConfigItem {
  value: boolean | number | string | string[]
  enabled: boolean
  type: ConfigType
  category: string
  label: string
  requiresSquadJS?: boolean
  isDefault: boolean
  updatedBy: string | null
  updatedByName: string | null
  updatedAt: string | null
}

export interface ConfigCategory {
  label: string
  description: string
  items: Record<string, ConfigItem>
}

// The config object maps config keys to ConfigItem
export type DutyConfig = Record<string, ConfigItem>

// Categories object maps category ids to ConfigCategory
export type DutyCategories = Record<string, ConfigCategory>

export interface DutySettingsAuditEntry {
  id: number
  configKey: string
  oldValue: string | null
  newValue: string
  changedBy: string
  changedByName: string | null
  changeType: 'create' | 'update' | 'enable' | 'disable'
  createdAt: string
}

// API Request/Response Types
export interface DutySettingsResponse {
  success: boolean
  data: {
    config: DutyConfig
    categories: DutyCategories
  }
}

export interface UpdateDutySettingsRequest {
  updates: Record<string, boolean | number | string | string[]>
}

export interface UpdateDutySettingsResponse {
  success: boolean
  data: {
    results: Array<{ key: string; success: boolean; error?: string }>
    updatedCount: number
  }
}

export interface DutySettingsAuditResponse {
  success: boolean
  data: DutySettingsAuditEntry[]
}

export interface ResetDutySettingsResponse {
  success: boolean
  message: string
}

// Voice channel type for channel selector
export interface VoiceChannel {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
  position: number
}

export interface VoiceChannelsResponse {
  success: boolean
  data: {
    channels: VoiceChannel[]
    totalCount: number
  }
}

// Config key constants for type safety
export const CONFIG_KEYS = {
  // Auto-timeout
  AUTO_TIMEOUT_ENABLED: 'auto_timeout_enabled',
  AUTO_TIMEOUT_HOURS: 'auto_timeout_hours',
  AUTO_TIMEOUT_WARNING_MINUTES: 'auto_timeout_warning_minutes',
  AUTO_TIMEOUT_EXTEND_ON_ACTIVITY: 'auto_timeout_extend_on_activity',

  // Tracking
  TRACK_VOICE_PRESENCE: 'track_voice_presence',
  TRACK_TICKET_RESPONSES: 'track_ticket_responses',
  TRACK_ADMIN_CAM: 'track_admin_cam',
  TRACK_INGAME_CHAT: 'track_ingame_chat',

  // Points
  POINTS_BASE_PER_MINUTE: 'points_base_per_minute',
  POINTS_VOICE_PER_MINUTE: 'points_voice_per_minute',
  POINTS_TICKET_RESPONSE: 'points_ticket_response',
  POINTS_ADMIN_CAM: 'points_admin_cam',
  POINTS_INGAME_CHAT: 'points_ingame_chat',

  // Coverage
  COVERAGE_LOW_THRESHOLD: 'coverage_low_threshold',
  COVERAGE_SNAPSHOT_INTERVAL_MINUTES: 'coverage_snapshot_interval_minutes',

  // Channels
  TRACKED_VOICE_CHANNELS: 'tracked_voice_channels',
  EXCLUDED_VOICE_CHANNELS: 'excluded_voice_channels',
  TICKET_CHANNEL_PATTERN: 'ticket_channel_pattern',
} as const
