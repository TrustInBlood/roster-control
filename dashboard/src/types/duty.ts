// Duty Stats Types

export type DutyPeriod = 'today' | 'week' | 'month' | 'all-time';
export type DutyType = 'admin' | 'tutor' | 'both';

export interface DutySession {
  id: number;
  startTime: string;
  endTime: string | null;
  duration: number; // milliseconds
  source: string;
  dutyType: 'admin' | 'tutor';
}

export interface DutyLeaderboardEntry {
  rank: number;
  discordUserId: string;
  discordUsername: string;
  displayName: string;
  avatarUrl: string | null;
  totalTime: number; // milliseconds
  sessionCount: number;
  averageSessionTime: number; // milliseconds
  longestSession: number; // milliseconds
  lastActive: string | null;
  totalPoints?: number; // from new points system
  voiceMinutes?: number;
  ticketResponses?: number;
}

export interface DutyUserStats {
  discordUserId: string;
  discordUsername: string;
  totalTime: number;
  sessionCount: number;
  averageSessionTime: number;
  longestSession: number;
  lastActive: string | null;
  currentlyOnDuty: boolean;
  currentSessionStart: string | null;
  recentSessions: DutySession[];
}

export interface DutySummaryStats {
  period: DutyPeriod;
  dutyType: DutyType;
  totalUsers: number;
  totalTime: number;
  totalSessions: number;
  averageTimePerUser: number;
  averageSessionsPerUser: number;
  currentlyOnDuty: number;
  topPerformers: Pick<DutyLeaderboardEntry, 'discordUserId' | 'discordUsername' | 'displayName' | 'avatarUrl' | 'totalTime'>[];
}

// API Response Types
export interface DutyLeaderboardResponse {
  success: boolean;
  data: {
    period: DutyPeriod;
    dutyType: DutyType;
    entries: DutyLeaderboardEntry[];
    totalEntries: number;
  };
}

export interface DutySummaryResponse {
  success: boolean;
  data: DutySummaryStats;
}

export interface DutyUserStatsResponse {
  success: boolean;
  data: DutyUserStats;
}

// Session types from new duty_sessions table
export type SessionEndReason = 'manual' | 'auto_timeout' | 'role_removed';

export interface DutySessionEntry {
  id: number;
  discordUserId: string;
  discordUsername: string;
  displayName: string;
  avatarUrl: string | null;
  dutyType: 'admin' | 'tutor';
  sessionStart: string;
  sessionEnd: string | null;
  durationMinutes: number;
  isActive: boolean;
  endReason: SessionEndReason | null;
  totalPoints: number;
  voiceMinutes: number;
  ticketResponses: number;
}

export interface DutySessionsResponse {
  success: boolean;
  data: DutySessionEntry[];
}

export interface DutySessionResponse {
  success: boolean;
  data: DutySessionEntry;
}

// Filter state for UI
export interface DutyFiltersState {
  period: DutyPeriod;
  dutyType: DutyType;
}

// Period and type labels for display
export const DUTY_PERIOD_LABELS: Record<DutyPeriod, string> = {
  'today': 'Today',
  'week': 'This Week',
  'month': 'This Month',
  'all-time': 'All Time'
};

export const DUTY_TYPE_LABELS: Record<DutyType, string> = {
  'admin': 'Admin',
  'tutor': 'Tutor',
  'both': 'All Staff'
};

// Staff Overview Types (lifetime stats with on/off duty breakdown)
export type StaffOverviewSortBy = 'points' | 'time' | 'tickets' | 'voice' | 'server';
export type StaffOverviewPeriod = 'week' | 'month';

export const STAFF_OVERVIEW_PERIOD_LABELS: Record<StaffOverviewPeriod, string> = {
  'week': 'This Week',
  'month': 'This Month',
};

export interface StaffOverviewEntry {
  rank: number;
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  steamId: string | null;

  // Time metrics (in minutes)
  totalDutyMinutes: number;
  totalSessions: number;
  totalServerMinutes: number;

  // Voice metrics
  totalVoiceMinutes: number;
  onDutyVoiceMinutes: number;
  offDutyVoiceMinutes: number;

  // Ticket metrics
  totalTicketResponses: number;
  onDutyTicketResponses: number;
  offDutyTicketResponses: number;

  // Other activity (not yet implemented)
  totalAdminCamEvents?: number;
  totalIngameChatMessages?: number;

  // Points
  totalPoints: number;
  onDutyPoints: number;
  offDutyPoints: number;
}

export interface StaffOverviewResponse {
  success: boolean;
  data: {
    entries: StaffOverviewEntry[];
    totalEntries: number;
    sortBy: StaffOverviewSortBy;
    period: StaffOverviewPeriod;
    currentlyOnDuty: number;
  };
}
