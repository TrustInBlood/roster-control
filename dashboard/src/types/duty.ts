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
  totalTime: number; // milliseconds
  sessionCount: number;
  averageSessionTime: number; // milliseconds
  longestSession: number; // milliseconds
  lastActive: string | null;
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
  topPerformers: Pick<DutyLeaderboardEntry, 'discordUserId' | 'discordUsername' | 'totalTime'>[];
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
