import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { userPreferencesApi } from '../lib/api'
import type {
  UserPreferences,
  DashboardSectionPreferences,
  SectionPreference,
  SectionKey,
  PartialUserPreferences,
} from '../types/preferences'
import { DEFAULT_PREFERENCES, DEFAULT_SECTION_PREFERENCES } from '../types/preferences'

const LOCAL_STORAGE_KEY = 'roster_control_preferences'
const LOCAL_STORAGE_TIMESTAMP_KEY = 'roster_control_preferences_timestamp'

/**
 * Get preferences from localStorage
 */
function getLocalPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PREFERENCES
}

/**
 * Save preferences to localStorage
 */
function setLocalPreferences(prefs: UserPreferences): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(prefs))
  localStorage.setItem(LOCAL_STORAGE_TIMESTAMP_KEY, new Date().toISOString())
}

/**
 * Get the timestamp of when local preferences were last updated
 */
function getLocalTimestamp(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_TIMESTAMP_KEY)
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const output = { ...target } as T
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key]
    if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
      output[key] = deepMerge(
        (target[key] || {}) as object,
        sourceVal as object
      ) as T[keyof T]
    } else if (sourceVal !== undefined) {
      output[key] = sourceVal as T[keyof T]
    }
  }
  return output
}

/**
 * Hook for managing user preferences with localStorage + backend sync
 */
export function useUserPreferences() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Local state initialized from localStorage
  const [localPrefs, setLocalPrefs] = useState<UserPreferences>(getLocalPreferences)
  const hasSynced = useRef(false)

  // Fetch remote preferences when authenticated
  const { data: remoteData, isLoading: isLoadingRemote } = useQuery({
    queryKey: ['userPreferences'],
    queryFn: userPreferencesApi.get,
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Mutation for updating remote preferences
  const updateMutation = useMutation({
    mutationFn: userPreferencesApi.update,
    onSuccess: (data) => {
      queryClient.setQueryData(['userPreferences'], {
        success: true,
        preferences: data.preferences,
        lastSync: data.lastSync,
      })
    },
  })

  // Sync local with remote on first load
  useEffect(() => {
    if (remoteData?.preferences && !hasSynced.current) {
      const localTimestamp = getLocalTimestamp()
      const remoteTimestamp = remoteData.lastSync

      // If remote is newer or local has no timestamp, use remote
      if (!localTimestamp || (remoteTimestamp && new Date(remoteTimestamp) > new Date(localTimestamp))) {
        const merged = deepMerge(DEFAULT_PREFERENCES, remoteData.preferences)
        setLocalPrefs(merged)
        setLocalPreferences(merged)
      } else {
        // Local is newer, push to remote
        updateMutation.mutate(localPrefs)
      }
      hasSynced.current = true
    }
  }, [remoteData, localPrefs, updateMutation])

  // Update a section preference (both local and remote)
  const updateSectionPreference = useCallback((
    section: SectionKey,
    pref: Partial<SectionPreference>
  ) => {
    setLocalPrefs(prev => {
      const currentSection = prev.dashboard?.sections?.[section] || DEFAULT_SECTION_PREFERENCES[section]
      const updated: UserPreferences = {
        ...prev,
        dashboard: {
          ...prev.dashboard,
          sections: {
            ...DEFAULT_SECTION_PREFERENCES,
            ...prev.dashboard?.sections,
            [section]: {
              ...currentSection,
              ...pref,
            },
          },
        },
      }
      setLocalPreferences(updated)

      // Sync to remote if authenticated
      if (user) {
        const partialUpdate: PartialUserPreferences = {
          dashboard: {
            sections: {
              [section]: {
                ...currentSection,
                ...pref,
              },
            },
          },
        }
        updateMutation.mutate(partialUpdate)
      }

      return updated
    })
  }, [user, updateMutation])

  // Get section preferences with defaults applied
  const getSectionPreferences = useCallback((
    section: SectionKey
  ): SectionPreference => {
    return {
      ...DEFAULT_SECTION_PREFERENCES[section],
      ...localPrefs.dashboard?.sections?.[section],
    }
  }, [localPrefs])

  // Get all section preferences
  const getAllSectionPreferences = useCallback((): DashboardSectionPreferences => {
    return {
      staff: getSectionPreferences('staff'),
      members: getSectionPreferences('members'),
      public: getSectionPreferences('public'),
    }
  }, [getSectionPreferences])

  return {
    preferences: localPrefs,
    isLoading: isLoadingRemote && !hasSynced.current,
    isSyncing: updateMutation.isPending,
    updateSectionPreference,
    getSectionPreferences,
    getAllSectionPreferences,
  }
}
