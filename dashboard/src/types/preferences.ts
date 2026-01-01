/**
 * Preference for a single dashboard section (staff, members, public)
 */
export interface SectionPreference {
  /** Whether this section is hidden from view */
  hidden: boolean
  /** Whether this section starts expanded by default */
  defaultExpanded: boolean
}

/**
 * Preferences for all dashboard sections
 */
export interface DashboardSectionPreferences {
  staff: SectionPreference
  members: SectionPreference
  public: SectionPreference
}

/**
 * Dashboard-specific preferences
 */
export interface DashboardPreferences {
  sections: DashboardSectionPreferences
}

/**
 * Complete user preferences object
 */
export interface UserPreferences {
  dashboard: DashboardPreferences
}

/**
 * API response for fetching user preferences
 */
export interface UserPreferencesResponse {
  success: boolean
  preferences: UserPreferences
  lastSync: string | null
}

/**
 * API response for updating user preferences
 */
export interface UpdatePreferencesResponse {
  success: boolean
  preferences: UserPreferences
  lastSync: string
}

/**
 * Default section preferences
 */
export const DEFAULT_SECTION_PREFERENCES: DashboardSectionPreferences = {
  staff: { hidden: false, defaultExpanded: true },
  members: { hidden: false, defaultExpanded: false },
  public: { hidden: false, defaultExpanded: false }
}

/**
 * Default user preferences
 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  dashboard: {
    sections: DEFAULT_SECTION_PREFERENCES
  }
}

/**
 * Section keys type for type safety
 */
export type SectionKey = keyof DashboardSectionPreferences

/**
 * Partial version for API updates
 */
export type PartialDashboardSectionPreferences = Partial<Record<SectionKey, Partial<SectionPreference>>>

export interface PartialDashboardPreferences {
  sections?: PartialDashboardSectionPreferences
}

export interface PartialUserPreferences {
  dashboard?: PartialDashboardPreferences
}
