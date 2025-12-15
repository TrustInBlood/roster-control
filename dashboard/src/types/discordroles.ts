export interface DiscordRoleGroup {
  id: number
  groupKey: string
  displayName: string
  description: string | null
  displayOrder: number
  color: string | null
  isSystemGroup: boolean
  securityCritical: boolean
  roleCount: number
  createdBy: string | null
  createdAt: string | null
  updatedBy: string | null
  updatedAt: string | null
}

export interface RoleGroupInfo {
  id: number
  groupKey: string
  displayName: string
}

export interface DiscordRoleEntry {
  id: number
  roleId: string
  roleKey: string
  roleName: string | null
  description: string | null
  groupIds: number[]
  groups: RoleGroupInfo[]
  isSystemRole: boolean
  discordPosition: number
  color: string
  createdBy: string | null
  createdAt: string | null
  updatedBy: string | null
  updatedAt: string | null
}

export interface DiscordRolesListResponse {
  roles: DiscordRoleEntry[]
  groups: DiscordRoleGroup[]
}

export interface DiscordRoleGroupsResponse {
  groups: DiscordRoleGroup[]
}

export interface DiscordRoleGroupDetailResponse {
  group: DiscordRoleGroup
  roles: DiscordRoleEntry[]
}

export interface DiscordRoleDetailResponse {
  role: DiscordRoleEntry
}

export interface AvailableDiscordRole {
  id: string
  name: string
  color: string
  position: number
}

export interface AvailableDiscordRolesResponse {
  roles: AvailableDiscordRole[]
}

export interface CreateGroupRequest {
  groupKey: string
  displayName: string
  description?: string
  color?: string
  displayOrder?: number
}

export interface UpdateGroupRequest {
  groupKey?: string
  displayName?: string
  description?: string
  color?: string
  displayOrder?: number
  securityCritical?: boolean
}

export interface CreateRoleRequest {
  roleId: string
  roleKey: string
  groupIds?: number[]
  description?: string
}

export interface UpdateRoleRequest {
  roleKey?: string
  groupIds?: number[]
  description?: string
}

export interface BatchCreateRolesRequest {
  roleIds: string[]
  groupIds: number[]
}

export interface BatchCreateResult {
  id: number
  roleId: string
  roleKey: string
  roleName: string
}

export interface BatchCreateRolesResponse {
  success: boolean
  results: {
    created: BatchCreateResult[]
    skipped: { roleId: string; reason: string }[]
    errors: { roleId: string; error: string }[]
  }
}

export interface CreateGroupResponse {
  success: boolean
  group: DiscordRoleGroup
}

export interface UpdateGroupResponse {
  success: boolean
}

export interface DeleteGroupResponse {
  success: boolean
}

export interface CreateRoleResponse {
  success: boolean
  role: DiscordRoleEntry
}

export interface UpdateRoleResponse {
  success: boolean
}

export interface DeleteRoleResponse {
  success: boolean
}

export interface ResetDiscordRolesResponse {
  success: boolean
  message: string
}
