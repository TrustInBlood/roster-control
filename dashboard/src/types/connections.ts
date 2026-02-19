export interface SquadJSServer {
  id: number
  serverKey: string
  name: string
  host: string
  port: number
  gamePort: number | null
  token: string | null
  enabled: boolean
  seedThreshold: number
  displayOrder: number
  createdBy: string | null
  createdByName: string | null
  updatedBy: string | null
  updatedByName: string | null
  createdAt: string
  updatedAt: string
  // Live status
  connectionState: 'connecting' | 'connected' | 'failed' | 'degraded' | 'unknown'
  connected: boolean
  reconnectAttempts: number
  disconnectedAt: string | null
  lastAttemptTime: string | null
  serverInfo: {
    publicQueue?: number
    reserveQueue?: number
    maxPlayers?: number
    currentMap?: string | null
    a2sPlayerCount?: number
    battlemetricsId?: string | null
    battlemetricsName?: string | null
    updatedAt?: number
  } | null
}

export interface ConnectionConfigItem {
  value: boolean | number | string
  type: 'boolean' | 'number' | 'string' | 'json'
  category: string
  label: string
  enabled: boolean
  isDefault: boolean
  updatedBy: string | null
  updatedByName: string | null
  updatedAt: string | null
}

export type ConnectionConfig = Record<string, ConnectionConfigItem>

export interface ConnectionConfigCategory {
  label: string
  description: string
  items: Record<string, ConnectionConfigItem>
}

export interface DbStatus {
  connected: boolean
  latencyMs?: number
  database?: string
  version?: string
  uptimeSeconds?: number
  poolSize?: number
  poolAvailable?: number
  error?: string
}

export interface ConnectionAuditEntry {
  id: number
  entityType: 'config' | 'server'
  entityId: string | null
  action: string
  oldValue: string | null
  newValue: string | null
  changedBy: string
  changedByName: string | null
  createdAt: string
}

export interface CreateServerRequest {
  serverKey: string
  name: string
  host: string
  port: number
  gamePort?: number | null
  token: string
  enabled?: boolean
  seedThreshold?: number
}

export interface UpdateServerRequest {
  name?: string
  host?: string
  port?: number
  gamePort?: number | null
  token?: string
  enabled?: boolean
  seedThreshold?: number
}
