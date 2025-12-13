import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AuthContextType, Permission } from '../types/auth'
import { authApi } from '../lib/api'

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

    // Check if user has this permission (from backend PermissionService)
    return user.permissions?.includes(permission) ?? false
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
