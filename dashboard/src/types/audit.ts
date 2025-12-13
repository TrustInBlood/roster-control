export interface AuditLogEntry {
  id: number
  actionId: string
  actionType: string
  actorType: string
  actorId: string
  actorName: string
  targetType: string
  targetId: string
  targetName: string
  description: string
  beforeState: Record<string, unknown> | null
  afterState: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  success: boolean
  errorMessage: string | null
  severity: 'info' | 'warn' | 'error' | 'critical'
  createdAt: string
}

export interface AuditLogListResponse {
  entries: AuditLogEntry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface AuditLogFilters {
  page?: number
  limit?: number
  actionType?: string
  actorId?: string
  targetId?: string
  severity?: string
  success?: string
  startDate?: string
  endDate?: string
  search?: string
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
}

export interface AuditLogStats {
  summary: {
    total: number
    successful: number
    failed: number
    byActorType: Record<string, number>
  }
  byActionType: Record<string, number>
  bySeverity: Record<string, number>
  activityByHour: Record<string, number>
  timeRange: {
    hours: number
    since: string
  }
}

export interface AuditLogDetailResponse {
  entry: AuditLogEntry
  relatedActions: AuditLogEntry[]
}

export interface UnlinkedStaffMember {
  discordId: string
  username: string
  userTag: string
  group: string
  avatarUrl?: string
}

export interface UnlinkedStaffResponse {
  total: number
  staffTotal: number
  groups: Record<string, UnlinkedStaffMember[]>
  ungrouped: UnlinkedStaffMember[]
}
