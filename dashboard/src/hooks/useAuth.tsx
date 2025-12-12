import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AuthContextType, Permission } from '../types/auth'
import { authApi } from '../lib/api'

// Role IDs that have specific permissions
// These should match the backend configuration
const PERMISSION_ROLES: Record<Permission, string[]> = {
  VIEW_WHITELIST: [], // All staff - checked dynamically
  GRANT_WHITELIST: [], // All staff
  REVOKE_WHITELIST: [], // Admins only
  VIEW_MEMBERS: [],
  ADD_MEMBER: [],
  BULK_IMPORT: [],
  VIEW_DUTY: [],
  VIEW_AUDIT: [],
  VIEW_SECURITY: [],
  MANAGE_SESSIONS: [],
  EXPORT_DATA: [],
}

// For now, we'll check permissions on the server side
// The frontend just needs to know if the user is authenticated
const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [isInitialized, setIsInitialized] = useState(false)

  const { data: user, isLoading: queryLoading, error } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.getMe,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  useEffect(() => {
    if (!queryLoading) {
      setIsInitialized(true)
    }
  }, [queryLoading])

  const login = useCallback(() => {
    window.location.href = authApi.getLoginUrl()
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    queryClient.setQueryData(['auth', 'me'], null)
    queryClient.invalidateQueries({ queryKey: ['auth'] })
  }, [queryClient])

  const hasPermission = useCallback((permission: Permission): boolean => {
    if (!user) return false

    // For now, if user is authenticated, assume they have basic permissions
    // The server will enforce actual permissions on API calls
    const basicPermissions: Permission[] = ['VIEW_WHITELIST', 'GRANT_WHITELIST']
    if (basicPermissions.includes(permission)) {
      return true
    }

    // Check if user has any role that grants this permission
    const requiredRoles = PERMISSION_ROLES[permission]
    if (requiredRoles.length === 0) {
      // No specific roles configured, allow if authenticated
      return true
    }

    return user.roles.some(role => requiredRoles.includes(role))
  }, [user])

  const isLoading = !isInitialized || queryLoading

  // Don't treat 401 as an error - user is just not logged in
  const actualUser = error ? null : user

  return (
    <AuthContext.Provider value={{ user: actualUser ?? null, isLoading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
