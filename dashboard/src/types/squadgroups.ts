export interface SquadPermission {
  id: string
  label: string
  description: string
}

export interface RoleConfig {
  roleId: string
  roleName: string | null
  groupName: string
  permissions: string[]
  discordPosition: number
  color: string
  createdBy: string | null
  createdAt: string | null
  updatedBy: string | null
  updatedAt: string | null
}

export interface SquadGroupsListResponse {
  roleConfigs: RoleConfig[]
  squadPermissions: SquadPermission[]
}

export interface DiscordRoleForSquad {
  id: string
  name: string
  color: string
  position: number
  isConfigured: boolean
}

export interface DiscordRolesForSquadResponse {
  roles: DiscordRoleForSquad[]
}

export interface RoleConfigResponse {
  roleConfig: RoleConfig
}

export interface AddRoleRequest {
  roleId: string
  groupName?: string
  permissions: string[]
}

export interface UpdateRoleRequest {
  groupName?: string
  permissions: string[]
}

export interface AddRoleResponse {
  success: boolean
  roleConfig: RoleConfig
}

export interface UpdateRoleResponse {
  success: boolean
  roleConfig: RoleConfig
}

export interface RemoveRoleResponse {
  success: boolean
  message: string
}

export interface ResetSquadGroupsRequest {
  confirm: 'RESET_ALL_SQUADGROUPS'
}

export interface ResetSquadGroupsResponse {
  success: boolean
  message: string
}
