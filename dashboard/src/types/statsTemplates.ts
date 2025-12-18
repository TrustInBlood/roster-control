// Stats Template types

export interface StatsTemplate {
  id: number
  name: string
  displayName: string
  filename: string
  isActive: boolean
  isDefault: boolean
  // Box positioning
  boxWidth: number
  boxHeight: number
  boxX: number | null
  boxY: number | null
  rightMargin: number
  // Text styling
  padding: number
  titleSize: number
  labelSize: number
  valueSize: number
  rowGap: number
  topGap: number
  sectionGap: number
  // Metadata
  createdBy: string | null
  createdAt: string
  updatedBy: string | null
  updatedAt: string
}

export interface RoleMapping {
  id: number
  roleId: string
  templateId: number
  templateName: string | null
  templateDisplayName: string | null
  priority: number
  createdBy: string | null
  createdAt: string
  // Enriched fields from Discord
  roleName?: string
  roleColor?: string
  rolePosition?: number
}

// API Response types
export interface StatsTemplatesListResponse {
  templates: StatsTemplate[]
}

export interface StatsTemplateDetailResponse {
  template: StatsTemplate
  roleMappings: { roleId: string; priority: number }[]
}

export interface RoleMappingsListResponse {
  mappings: RoleMapping[]
}

export interface DiscordRolesForMappingResponse {
  roles: {
    id: string
    name: string
    color: string
    position: number
  }[]
}

// API Request types
export interface CreateTemplateRequest {
  name: string
  displayName: string
  // Form data with image file
}

export interface UpdateTemplateRequest {
  displayName?: string
  isActive?: boolean
  boxWidth?: number
  boxHeight?: number
  boxX?: number | null
  boxY?: number | null
  rightMargin?: number
  padding?: number
  titleSize?: number
  labelSize?: number
  valueSize?: number
  rowGap?: number
  topGap?: number
  sectionGap?: number
}

export interface CreateRoleMappingRequest {
  roleId: string
  templateId: number
  priority?: number
}

// API Response types for mutations
export interface CreateTemplateResponse {
  success: boolean
  template: StatsTemplate
}

export interface UpdateTemplateResponse {
  success: boolean
  template: StatsTemplate
}

export interface DeleteTemplateResponse {
  success: boolean
  message: string
}

export interface SetDefaultTemplateResponse {
  success: boolean
  message: string
}

export interface CreateRoleMappingResponse {
  success: boolean
  mapping: {
    id: number
    roleId: string
    templateId: number
    priority: number
    createdBy: string | null
    createdAt: string
    isNew: boolean
  }
}

export interface DeleteRoleMappingResponse {
  success: boolean
  message: string
}

export interface RefreshCacheResponse {
  success: boolean
  message: string
}

export interface SeedTemplatesResponse {
  success: boolean
  message: string
}

// Image validation response
export interface ImageValidationError {
  error: string
  code: 'INVALID_DIMENSIONS'
  actual: { width: number; height: number }
  required: { width: number; height: number }
}
