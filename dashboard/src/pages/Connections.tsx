import { useState, useEffect, useMemo } from 'react'
import {
  Network, Database, Server, Plus, RefreshCw, Trash2, Edit3, Power, PowerOff,
  Save, AlertCircle, History, CheckSquare, Square, Settings, Shield,
  Wifi, WifiOff, Timer, Gauge
} from 'lucide-react'
import {
  useConnectionServers, useConnectionSettings, useUpdateConnectionSettings,
  useCreateServer, useUpdateServer, useDeleteServer, useReconnectServer,
  useDbStatus, useConnectionAudit
} from '../hooks/useConnections'
import { useAuth } from '../hooks/useAuth'
import InfoTooltip from '../components/ui/InfoTooltip'
import NumberInput from '../components/ui/NumberInput'
import type { SquadJSServer, ConnectionConfigItem, CreateServerRequest, UpdateServerRequest } from '../types/connections'

// ============================================
// Status Helpers
// ============================================

function getStateColor(state: string, enabled: boolean) {
  if (!enabled) return 'bg-gray-500'
  switch (state) {
    case 'connected': return 'bg-green-500'
    case 'connecting': return 'bg-yellow-500'
    case 'failed': return 'bg-red-500'
    case 'degraded': return 'bg-orange-500'
    default: return 'bg-gray-500'
  }
}

function getStateLabel(state: string, enabled: boolean) {
  if (!enabled) return 'Disabled'
  switch (state) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting'
    case 'failed': return 'Disconnected'
    case 'degraded': return 'Degraded'
    default: return 'Unknown'
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// ============================================
// Settings Descriptions
// ============================================

const CONFIG_DESCRIPTIONS: Record<string, string> = {
  cache_refresh_seconds: 'How often the whitelist cache refreshes from the database.',
  cache_cleanup_interval: 'Interval for cleaning up stale cache entries.',
  prefer_eos_id: 'Use EOS IDs instead of Steam IDs for player identification.',
  verification_code_length: 'Number of characters in verification codes for account linking.',
  verification_expiration_minutes: 'How long verification codes remain valid.',
  verification_cleanup_interval: 'Interval for cleaning up expired verification codes.',
  reconnection_attempts: 'Maximum reconnection attempts before entering degraded mode.',
  reconnection_delay: 'Base delay between reconnection attempts (exponential backoff).',
  connection_timeout: 'Timeout for initial connection to SquadJS servers.',
  log_level: 'Logging verbosity level.',
  log_connections: 'Log connection and disconnection events.',
  log_cache_hits: 'Log cache hit/miss events (very verbose).',
  log_squadjs_events: 'Log unknown SquadJS events for debugging.',
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  cache: Timer,
  identifiers: Gauge,
  verification: Shield,
  connection: Wifi,
  logging: Settings,
}

// ============================================
// Server Card
// ============================================

interface ServerCardProps {
  server: SquadJSServer
  onEdit: (server: SquadJSServer) => void
  onReconnect: (key: string) => void
  onDelete: (key: string) => void
  onToggle: (server: SquadJSServer) => void
  isReconnecting: boolean
}

function ServerCard({ server, onEdit, onReconnect, onDelete, onToggle, isReconnecting }: ServerCardProps) {
  const playerCount = server.serverInfo?.a2sPlayerCount ?? null
  const maxPlayers = server.serverInfo?.maxPlayers ?? null
  const publicQueue = server.serverInfo?.publicQueue ?? 0
  const bmName = server.serverInfo?.battlemetricsName

  return (
    <div className="bg-discord-light rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${getStateColor(server.connectionState, server.enabled)} ${server.connectionState === 'connected' && server.enabled ? 'animate-pulse' : ''}`} />
          <div>
            <h3 className="text-white font-semibold">{server.name}</h3>
            <p className="text-gray-400 text-sm">
              {server.host}:{server.port}
              {server.gamePort && <span className="text-gray-500"> (game: {server.gamePort})</span>}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          server.connectionState === 'connected' && server.enabled
            ? 'bg-green-500/20 text-green-400'
            : server.connectionState === 'degraded'
              ? 'bg-orange-500/20 text-orange-400'
              : !server.enabled
                ? 'bg-gray-500/20 text-gray-400'
                : 'bg-red-500/20 text-red-400'
        }`}>
          {getStateLabel(server.connectionState, server.enabled)}
        </span>
      </div>

      {/* Server Info */}
      {server.enabled && server.connected && (
        <div className="flex items-center gap-4 mb-3 text-sm text-gray-400">
          {playerCount !== null && maxPlayers !== null && (
            <span>Players: {playerCount}/{maxPlayers}</span>
          )}
          {publicQueue > 0 && (
            <span>Queue: {publicQueue}</span>
          )}
          {server.serverInfo?.currentMap && (
            <span className="truncate max-w-[200px]">{server.serverInfo.currentMap}</span>
          )}
        </div>
      )}

      {bmName && (
        <p className="text-xs text-gray-500 mb-3 truncate">{bmName}</p>
      )}

      {/* Meta info */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
        <span>Key: {server.serverKey}</span>
        <span>Seed threshold: {server.seedThreshold}</span>
        {server.reconnectAttempts > 0 && (
          <span className="text-orange-400">Attempts: {server.reconnectAttempts}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-discord-lighter">
        <button
          onClick={() => onEdit(server)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-discord-lighter"
        >
          <Edit3 className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={() => onReconnect(server.serverKey)}
          disabled={isReconnecting || !server.enabled}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-discord-lighter disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
          Reconnect
        </button>
        <button
          onClick={() => onToggle(server)}
          className={`flex items-center gap-1.5 text-sm transition-colors px-2 py-1 rounded hover:bg-discord-lighter ${
            server.enabled ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'
          }`}
        >
          {server.enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
          {server.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          onClick={() => onDelete(server.serverKey)}
          className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-discord-lighter ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </div>
  )
}

// ============================================
// Server Form Modal
// ============================================

interface ServerFormModalProps {
  server?: SquadJSServer | null
  existingKeys: string[]
  onClose: () => void
  onSave: (data: CreateServerRequest | UpdateServerRequest, isNew: boolean) => void
  isSaving: boolean
}

function generateNextServerKey(existingKeys: string[]): string {
  let n = existingKeys.length + 1
  while (existingKeys.includes(`server${n}`)) n++
  return `server${n}`
}

function ServerFormModal({ server, existingKeys, onClose, onSave, isSaving }: ServerFormModalProps) {
  const isNew = !server
  const [form, setForm] = useState({
    serverKey: server?.serverKey || generateNextServerKey(existingKeys),
    name: server?.name || '',
    host: server?.host || '',
    port: server?.port || 0,
    gamePort: server?.gamePort || 0,
    token: '',
    enabled: server?.enabled ?? true,
    seedThreshold: server?.seedThreshold || 50,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isNew) {
      onSave({
        serverKey: form.serverKey,
        name: form.name,
        host: form.host,
        port: form.port,
        gamePort: form.gamePort || undefined,
        token: form.token,
        enabled: form.enabled,
        seedThreshold: form.seedThreshold,
      } as CreateServerRequest, true)
    } else {
      const data: UpdateServerRequest = {
        name: form.name,
        host: form.host,
        port: form.port,
        gamePort: form.gamePort || null,
        enabled: form.enabled,
        seedThreshold: form.seedThreshold,
      }
      if (form.token.trim()) data.token = form.token
      onSave(data, false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-discord-dark rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-4">
          {isNew ? 'Add Server' : `Edit ${server?.name}`}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Squad Server 6"
              required
              className="w-full bg-discord-lighter border border-discord-lighter rounded-md px-3 py-2 text-white focus:outline-none focus:border-discord-blurple"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Host</label>
              <input
                type="text"
                value={form.host}
                onChange={e => setForm({ ...form, host: e.target.value })}
                placeholder="216.114.75.106"
                required
                className="w-full bg-discord-lighter border border-discord-lighter rounded-md px-3 py-2 text-white focus:outline-none focus:border-discord-blurple"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">SquadJS Port</label>
              <input
                type="number"
                value={form.port || ''}
                onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 0 })}
                min={1}
                max={65535}
                required
                className="w-full bg-discord-lighter border border-discord-lighter rounded-md px-3 py-2 text-white focus:outline-none focus:border-discord-blurple"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Game Port</label>
              <input
                type="number"
                value={form.gamePort || ''}
                onChange={e => setForm({ ...form, gamePort: parseInt(e.target.value) || 0 })}
                min={1}
                max={65535}
                className="w-full bg-discord-lighter border border-discord-lighter rounded-md px-3 py-2 text-white focus:outline-none focus:border-discord-blurple"
              />
              <p className="text-xs text-gray-500 mt-1">For BattleMetrics matching</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Seed Threshold</label>
              <input
                type="number"
                value={form.seedThreshold}
                onChange={e => setForm({ ...form, seedThreshold: parseInt(e.target.value) || 50 })}
                min={1}
                className="w-full bg-discord-lighter border border-discord-lighter rounded-md px-3 py-2 text-white focus:outline-none focus:border-discord-blurple"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Token {!isNew && <span className="text-gray-500">(leave empty to keep current)</span>}
            </label>
            <input
              type="password"
              value={form.token}
              onChange={e => setForm({ ...form, token: e.target.value })}
              required={isNew}
              autoComplete="off"
              className="w-full bg-discord-lighter border border-discord-lighter rounded-md px-3 py-2 text-white focus:outline-none focus:border-discord-blurple"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              className="flex-shrink-0"
            >
              {form.enabled ? (
                <CheckSquare className="w-5 h-5 text-discord-blurple" />
              ) : (
                <Square className="w-5 h-5 text-gray-500" />
              )}
            </button>
            <span className="text-sm text-gray-300">Enabled</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : isNew ? 'Add Server' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================
// Delete Confirm Modal
// ============================================

function DeleteConfirmModal({ serverKey, onClose, onConfirm, isDeleting }: {
  serverKey: string
  onClose: () => void
  onConfirm: () => void
  isDeleting: boolean
}) {
  const [confirmText, setConfirmText] = useState('')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-discord-dark rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-white mb-2">Delete Server</h2>
        <p className="text-gray-400 text-sm mb-4">
          This will permanently remove the server and disconnect it. Type <code className="text-red-400 bg-red-500/10 px-1 rounded">{serverKey}</code> to confirm.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={serverKey}
          className="w-full bg-discord-lighter border border-discord-lighter rounded-md px-3 py-2 text-white focus:outline-none focus:border-red-500 mb-4"
        />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmText !== serverKey || isDeleting}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Settings Section
// ============================================

interface SettingsSectionProps {
  title: string
  description?: string
  icon: React.ElementType
  children: React.ReactNode
}

function SettingsSection({ title, description, icon: Icon, children }: SettingsSectionProps) {
  return (
    <div className="bg-discord-light rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <Icon className="w-5 h-5 text-discord-blurple" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {description && (
        <p className="text-sm text-gray-400 mb-4">{description}</p>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

// ============================================
// Config Input
// ============================================

function ConfigInput({ configKey, item, value, onChange, disabled }: {
  configKey: string
  item: ConnectionConfigItem
  value: boolean | number | string
  onChange: (key: string, value: boolean | number | string) => void
  disabled?: boolean
}) {
  const description = CONFIG_DESCRIPTIONS[configKey]

  if (item.type === 'boolean') {
    return (
      <label className={`flex items-start gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-discord-lighter/30'} rounded p-2 -mx-2`}>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); if (!disabled) onChange(configKey, !value) }}
          disabled={disabled}
          className="mt-0.5 flex-shrink-0"
        >
          {value ? <CheckSquare className="w-5 h-5 text-discord-blurple" /> : <Square className="w-5 h-5 text-gray-500" />}
        </button>
        <span className="text-white text-sm font-medium flex items-center">
          {item.label}
          {description && <InfoTooltip text={description} />}
        </span>
      </label>
    )
  }

  if (item.type === 'number') {
    return (
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300 flex items-center">
          {item.label}
          {description && <InfoTooltip text={description} />}
        </label>
        <NumberInput
          id={`conn-config-${configKey}`}
          name={`conn-config-${configKey}`}
          value={typeof value === 'number' ? value : 0}
          onChange={(val) => onChange(configKey, val)}
          disabled={disabled}
          className="w-28"
        />
      </div>
    )
  }

  if (item.type === 'string') {
    return (
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300 flex items-center">
          {item.label}
          {description && <InfoTooltip text={description} />}
        </label>
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(configKey, e.target.value)}
          disabled={disabled}
          className="w-36 bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-discord-blurple disabled:opacity-50"
        />
      </div>
    )
  }

  return null
}

// ============================================
// Main Page
// ============================================

export default function Connections() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('MANAGE_CONNECTIONS')

  const { data: serversData, isLoading: serversLoading } = useConnectionServers()
  const { data: settingsData, isLoading: settingsLoading } = useConnectionSettings()
  const { data: dbStatusData } = useDbStatus()
  const { data: auditData } = useConnectionAudit(10)

  const updateSettingsMutation = useUpdateConnectionSettings()
  const createServerMutation = useCreateServer()
  const updateServerMutation = useUpdateServer()
  const deleteServerMutation = useDeleteServer()
  const reconnectServerMutation = useReconnectServer()

  const [showServerForm, setShowServerForm] = useState(false)
  const [editingServer, setEditingServer] = useState<SquadJSServer | null>(null)
  const [deletingServerKey, setDeletingServerKey] = useState<string | null>(null)
  const [localSettings, setLocalSettings] = useState<Record<string, { value: boolean | number | string }> | null>(null)

  const servers = serversData?.data || []
  const dbStatus = dbStatusData?.data
  const config = settingsData?.data?.config
  const categories = settingsData?.data?.categories

  // Initialize local settings from server data
  useEffect(() => {
    if (config && !localSettings) {
      const local: Record<string, { value: boolean | number | string }> = {}
      for (const [key, item] of Object.entries(config)) {
        local[key] = { value: item.value as boolean | number | string }
      }
      setLocalSettings(local)
    }
  }, [config, localSettings])

  const settingsHasChanges = useMemo(() => {
    if (!localSettings || !config) return false
    for (const key of Object.keys(localSettings)) {
      if (JSON.stringify(localSettings[key]?.value) !== JSON.stringify(config[key]?.value)) return true
    }
    return false
  }, [localSettings, config])

  const pendingSettingsChanges = useMemo(() => {
    if (!localSettings || !config) return {}
    const changes: Record<string, boolean | number | string> = {}
    for (const key of Object.keys(localSettings)) {
      if (JSON.stringify(localSettings[key]?.value) !== JSON.stringify(config[key]?.value)) {
        changes[key] = localSettings[key].value
      }
    }
    return changes
  }, [localSettings, config])

  const handleSaveSettings = async () => {
    if (Object.keys(pendingSettingsChanges).length === 0) return
    try {
      await updateSettingsMutation.mutateAsync(pendingSettingsChanges)
    } catch { /* handled by mutation */ }
  }

  const handleSettingChange = (key: string, value: boolean | number | string) => {
    if (!localSettings) return
    setLocalSettings({ ...localSettings, [key]: { value } })
  }

  const handleServerSave = async (data: CreateServerRequest | UpdateServerRequest, isNew: boolean) => {
    try {
      if (isNew) {
        await createServerMutation.mutateAsync(data as CreateServerRequest)
      } else if (editingServer) {
        await updateServerMutation.mutateAsync({ key: editingServer.serverKey, data: data as UpdateServerRequest })
      }
      setShowServerForm(false)
      setEditingServer(null)
    } catch { /* handled by mutation */ }
  }

  const handleToggleServer = async (server: SquadJSServer) => {
    try {
      await updateServerMutation.mutateAsync({
        key: server.serverKey,
        data: { enabled: !server.enabled }
      })
    } catch { /* handled by mutation */ }
  }

  const handleDeleteServer = async () => {
    if (!deletingServerKey) return
    try {
      await deleteServerMutation.mutateAsync(deletingServerKey)
      setDeletingServerKey(null)
    } catch { /* handled by mutation */ }
  }

  const isLoading = serversLoading || settingsLoading

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Network className="w-7 h-7 text-discord-blurple" />
            Connections
          </h1>
          <p className="text-gray-400 mt-1">
            Manage SquadJS server connections and integration settings
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditingServer(null); setShowServerForm(true) }}
            className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
        </div>
      ) : (
        <>
          {/* Database Status */}
          <div className="bg-discord-light rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <Database className="w-5 h-5 text-discord-blurple" />
              <h2 className="text-lg font-semibold text-white">Database</h2>
            </div>
            {dbStatus ? (
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${dbStatus.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className={dbStatus.connected ? 'text-green-400' : 'text-red-400'}>
                    {dbStatus.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {dbStatus.latencyMs !== undefined && (
                  <span className="text-gray-400">Latency: {dbStatus.latencyMs}ms</span>
                )}
                {dbStatus.database && (
                  <span className="text-gray-400">{dbStatus.database}</span>
                )}
                {dbStatus.version && (
                  <span className="text-gray-500 text-xs">{dbStatus.version}</span>
                )}
                {dbStatus.uptimeSeconds !== undefined && dbStatus.uptimeSeconds > 0 && (
                  <span className="text-gray-500 text-xs">Uptime: {formatUptime(dbStatus.uptimeSeconds)}</span>
                )}
                {dbStatus.poolSize !== undefined && (
                  <span className="text-gray-500 text-xs">Pool: {dbStatus.poolAvailable}/{dbStatus.poolSize}</span>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Loading database status...</p>
            )}
          </div>

          {/* Servers */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Server className="w-5 h-5 text-discord-blurple" />
              <h2 className="text-lg font-semibold text-white">SquadJS Servers</h2>
              <span className="text-sm text-gray-500">({servers.length})</span>
            </div>
            {servers.length === 0 ? (
              <div className="bg-discord-light rounded-lg p-8 text-center">
                <WifiOff className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No servers configured yet.</p>
                {canEdit && (
                  <button
                    onClick={() => { setEditingServer(null); setShowServerForm(true) }}
                    className="mt-3 text-discord-blurple hover:text-discord-blurple/80 text-sm"
                  >
                    Add your first server
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {servers.map(server => (
                  <ServerCard
                    key={server.serverKey}
                    server={server}
                    onEdit={(s) => { setEditingServer(s); setShowServerForm(true) }}
                    onReconnect={(key) => reconnectServerMutation.mutate(key)}
                    onDelete={(key) => setDeletingServerKey(key)}
                    onToggle={handleToggleServer}
                    isReconnecting={reconnectServerMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          {config && categories && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-discord-blurple" />
                  <h2 className="text-lg font-semibold text-white">Settings</h2>
                </div>
                {canEdit && (
                  <button
                    onClick={handleSaveSettings}
                    disabled={!settingsHasChanges || updateSettingsMutation.isPending}
                    className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                  </button>
                )}
              </div>

              {settingsHasChanges && canEdit && (
                <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <p className="text-sm text-yellow-200">You have unsaved settings changes.</p>
                </div>
              )}

              {updateSettingsMutation.isSuccess && (
                <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 mb-4">
                  <p className="text-sm text-green-400">Settings saved successfully!</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {Object.entries(categories).map(([categoryId, category]) => {
                  const Icon = CATEGORY_ICONS[categoryId] || Settings
                  const items = Object.entries(category.items)
                  if (items.length === 0) return null

                  return (
                    <SettingsSection
                      key={categoryId}
                      title={category.label}
                      description={category.description}
                      icon={Icon}
                    >
                      {items.map(([key, item]) => (
                        <ConfigInput
                          key={key}
                          configKey={key}
                          item={item}
                          value={(localSettings?.[key]?.value ?? item.value) as boolean | number | string}
                          onChange={handleSettingChange}
                          disabled={!canEdit}
                        />
                      ))}
                    </SettingsSection>
                  )
                })}
              </div>
            </div>
          )}

          {/* Audit Log */}
          <SettingsSection
            title="Recent Changes"
            icon={History}
            description="Audit log of connection config and server changes"
          >
            {auditData?.data && auditData.data.length > 0 ? (
              <div className="space-y-2">
                {auditData.data.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 text-sm bg-discord-darker rounded-md p-3"
                  >
                    <div className="flex-1">
                      <span className="text-gray-300">
                        <span className="text-white font-medium">{entry.changedByName || 'System'}</span>
                        {' '}{entry.action}{' '}
                        <code className="text-discord-blurple bg-discord-blurple/20 px-1 rounded">
                          {entry.entityType === 'server' ? `server:${entry.entityId}` : entry.entityId}
                        </code>
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No recent changes recorded.</p>
            )}
          </SettingsSection>
        </>
      )}

      {/* Modals */}
      {showServerForm && (
        <ServerFormModal
          server={editingServer}
          existingKeys={servers.map(s => s.serverKey)}
          onClose={() => { setShowServerForm(false); setEditingServer(null) }}
          onSave={handleServerSave}
          isSaving={createServerMutation.isPending || updateServerMutation.isPending}
        />
      )}

      {deletingServerKey && (
        <DeleteConfirmModal
          serverKey={deletingServerKey}
          onClose={() => setDeletingServerKey(null)}
          onConfirm={handleDeleteServer}
          isDeleting={deleteServerMutation.isPending}
        />
      )}
    </div>
  )
}
