export interface PermissionRole {
  id: string
  name: string | null
  grantedBy: string | null
  grantedAt: string | null
}

export interface Permission {
  name: string
  description: string
  critical: boolean
  roles: PermissionRole[]
}

export interface PermissionsListResponse {
  permissions: Permission[]
}

export interface DiscordRole {
  id: string
  name: string
  color: string
  position: number
}

export interface DiscordRolesResponse {
  roles: DiscordRole[]
}

export interface PermissionDefinition {
  name: string
  description: string
  critical: boolean
}

export interface PermissionDefinitionsResponse {
  definitions: PermissionDefinition[]
}

export interface UpdatePermissionRequest {
  roleIds: string[]
}

export interface UpdatePermissionResponse {
  success: boolean
  permission: Permission
}

export interface ResetPermissionsRequest {
  confirm: 'RESET_ALL_PERMISSIONS'
}

export interface ResetPermissionsResponse {
  success: boolean
  message: string
}
