export interface User {
  id: string
  username: string
  discriminator: string
  avatar: string | null
  avatarUrl: string
  roles: string[]
  permissions: Permission[]
  displayName: string
  isStaff: boolean
}

export interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: () => void
  logout: () => Promise<void>
  hasPermission: (permission: Permission) => boolean
}

export type Permission =
  | 'VIEW_WHITELIST'
  | 'GRANT_WHITELIST'
  | 'REVOKE_WHITELIST'
  | 'VIEW_MEMBERS'
  | 'ADD_MEMBER'
  | 'BULK_IMPORT'
  | 'VIEW_DUTY'
  | 'VIEW_AUDIT'
  | 'VIEW_SECURITY'
  | 'MANAGE_SESSIONS'
  | 'EXPORT_DATA'
  | 'MANAGE_PERMISSIONS'
  | 'VIEW_STATS_TEMPLATES'
  | 'MANAGE_STATS_TEMPLATES'
  | 'VIEW_SEEDING'
  | 'MANAGE_SEEDING'
