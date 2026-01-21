import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, Settings, RotateCcw, Clock, Activity, Award, Users, History, CheckSquare, Square, Save, AlertCircle, Hash, Target } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useDutySettings, useUpdateDutySettings, useDutySettingsAudit, useResetDutySettings, useVoiceChannels } from '../hooks/useDutySettings'
import { useAuth } from '../hooks/useAuth'
import { VoiceChannelSelect, ActivityTargetCalculator } from '../components/duty'
import InfoTooltip from '../components/ui/InfoTooltip'
import NumberInput from '../components/ui/NumberInput'
import type { DutyConfig, ConfigItem, VoiceChannel } from '../types/dutySettings'

// Descriptions for each config setting (shown in tooltips)
const CONFIG_DESCRIPTIONS: Record<string, string> = {
  // Timeout settings
  auto_timeout_enabled: 'Automatically end duty sessions after a period of inactivity to ensure accurate tracking.',
  auto_timeout_hours: 'Maximum duration (in hours) a duty session can last before automatic timeout. Helps prevent forgotten sessions.',
  auto_timeout_warning_minutes: 'Send a warning message this many minutes before the session times out.',
  auto_timeout_extend_on_activity: 'Reset the timeout timer when staff activity is detected (voice, tickets, etc.).',

  // Tracking settings
  track_voice_presence: 'Track time spent in voice channels while on duty.',
  track_ticket_responses: 'Track responses to support tickets while on duty.',
  track_admin_cam: 'Track admin camera usage on game servers (requires SquadJS).',
  track_ingame_chat: 'Track in-game admin chat messages (requires SquadJS).',

  // Points settings
  points_base_per_minute: 'Base points earned per minute while on duty, regardless of activity.',
  points_voice_per_minute: 'Additional points earned per minute while in a tracked voice channel.',
  points_ticket_response: 'Points awarded for each ticket response.',
  points_admin_cam: 'Points awarded for using admin camera on the game server.',
  points_ingame_chat: 'Points awarded for each in-game admin chat message.',
  points_server_per_minute: 'Points per minute while connected to a tracked game server.',
  on_duty_multiplier: 'Multiplier applied to all point earnings while on duty (e.g., 1.5 = 50% bonus).',
  weekly_points_target: 'Target number of points to earn per week. Used in the activity calculator.',

  // Coverage settings
  coverage_low_threshold: 'Minimum number of admins required before coverage is considered "low".',
  coverage_snapshot_interval_minutes: 'How often (in minutes) to record a coverage snapshot for analytics.',

  // Channel settings
  tracked_voice_channels: 'Limit voice tracking to these channels only. Leave empty to track all voice channels.',
  excluded_voice_channels: 'Never track voice activity in these channels (e.g., AFK channel).',
  ticket_channel_pattern: 'Pattern to identify ticket channels (supports wildcards like ticket-*).',
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  timeout: Clock,
  tracking: Activity,
  points: Award,
  coverage: Users,
  channels: Hash,
}

// Helper to format voice channel changes in audit log
function formatVoiceChannelChange(
  oldValue: string | null,
  newValue: string,
  voiceChannels: VoiceChannel[]
): { added: string[]; removed: string[] } | null {
  try {
    const oldIds: string[] = oldValue ? JSON.parse(oldValue) : []
    const newIds: string[] = JSON.parse(newValue)

    const added = newIds.filter(id => !oldIds.includes(id))
    const removed = oldIds.filter(id => !newIds.includes(id))

    const resolveNames = (ids: string[]) =>
      ids.map(id => {
        const channel = voiceChannels.find(c => c.id === id)
        return channel?.name || `Unknown (${id.slice(-6)})`
      })

    return {
      added: resolveNames(added),
      removed: resolveNames(removed),
    }
  } catch {
    return null
  }
}

// Check if a config key is a voice channel array
function isVoiceChannelConfig(configKey: string): boolean {
  return configKey === 'excluded_voice_channels' || configKey === 'tracked_voice_channels'
}

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

interface ConfigInputProps {
  configKey: string
  item: ConfigItem
  value: boolean | number | string | string[]
  onChange: (key: string, value: boolean | number | string | string[]) => void
  disabled?: boolean
  voiceChannels?: VoiceChannel[]
}

function ConfigInput({ configKey, item, value, onChange, disabled, voiceChannels }: ConfigInputProps) {
  const isSquadJSRequired = item.requiresSquadJS
  const description = CONFIG_DESCRIPTIONS[configKey]

  if (item.type === 'boolean') {
    return (
      <label className={`flex items-start gap-3 ${disabled || isSquadJSRequired ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-discord-lighter/30'} rounded p-2 -mx-2`}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            if (!disabled && !isSquadJSRequired) onChange(configKey, !value)
          }}
          disabled={disabled || isSquadJSRequired}
          className="mt-0.5 flex-shrink-0"
        >
          {value ? (
            <CheckSquare className="w-5 h-5 text-discord-blurple" />
          ) : (
            <Square className="w-5 h-5 text-gray-500" />
          )}
        </button>
        <div className="flex-1">
          <span className="text-white text-sm font-medium flex items-center">
            {item.label}
            {description && <InfoTooltip text={description} />}
          </span>
          {isSquadJSRequired && (
            <p className="text-yellow-500/70 text-xs mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Coming soon
            </p>
          )}
        </div>
      </label>
    )
  }

  if (item.type === 'number') {
    // Determine min value - multiplier should never be 0
    const minValue = configKey === 'on_duty_multiplier' ? 0.01 : undefined

    return (
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label className="text-sm font-medium text-gray-300 flex items-center">
            {item.label}
            {description && <InfoTooltip text={description} />}
          </label>
          {isSquadJSRequired && (
            <p className="text-yellow-500/70 text-xs mt-0.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Coming soon
            </p>
          )}
        </div>
        <NumberInput
          id={`duty-config-${configKey}`}
          name={`duty-config-${configKey}`}
          value={typeof value === 'number' ? value : 0}
          onChange={(val) => onChange(configKey, val)}
          min={minValue}
          disabled={disabled || isSquadJSRequired}
          className="w-24"
        />
      </div>
    )
  }

  if (item.type === 'string') {
    return (
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label className="text-sm font-medium text-gray-300 flex items-center">
            {item.label}
            {description && <InfoTooltip text={description} />}
          </label>
        </div>
        <input
          type="search"
          id={`duty-config-${configKey}`}
          name={`duty-config-${configKey}`}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(configKey, e.target.value)}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
          className="w-48 bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-white focus:outline-none focus:border-discord-blurple disabled:opacity-50"
        />
      </div>
    )
  }

  // JSON type (arrays) - use VoiceChannelSelect for voice channel configs
  if (item.type === 'json' && Array.isArray(value)) {
    // Check if this is a voice channel config
    if ((configKey === 'excluded_voice_channels' || configKey === 'tracked_voice_channels') && voiceChannels) {
      return (
        <VoiceChannelSelect
          channels={voiceChannels}
          selectedIds={value as string[]}
          onChange={(ids) => onChange(configKey, ids)}
          disabled={disabled}
          label={item.label}
          description={configKey === 'excluded_voice_channels'
            ? 'Voice activity in these channels will not be tracked (e.g., AFK channel)'
            : 'Only track voice activity in these channels (leave empty to track all)'
          }
        />
      )
    }

    // Default display for other JSON arrays
    return (
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">{item.label}</label>
        <div className="text-sm text-gray-400 bg-discord-darker rounded-md px-3 py-2">
          {value.length === 0 ? (
            <span className="text-gray-500 italic">No items configured</span>
          ) : (
            <span>{value.length} item(s) configured</span>
          )}
        </div>
      </div>
    )
  }

  return null
}

export default function DutySettings() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('MANAGE_DUTY_SETTINGS') // Only super admins can edit

  const { data, isLoading, isRefetching, error } = useDutySettings()
  const { data: voiceChannelsData } = useVoiceChannels()
  const updateMutation = useUpdateDutySettings()
  const resetMutation = useResetDutySettings()
  const { data: auditData } = useDutySettingsAudit(10)

  const voiceChannels = voiceChannelsData?.data?.channels || []

  const [localConfig, setLocalConfig] = useState<DutyConfig | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Initialize local config from server data
  useEffect(() => {
    if (data?.data?.config && !localConfig) {
      setLocalConfig(data.data.config)
    }
  }, [data, localConfig])

  // Track changes
  const hasChanges = useMemo(() => {
    if (!localConfig || !data?.data?.config) return false

    for (const key of Object.keys(localConfig)) {
      const localValue = localConfig[key]?.value
      const serverValue = data.data.config[key]?.value
      if (JSON.stringify(localValue) !== JSON.stringify(serverValue)) {
        return true
      }
    }
    return false
  }, [localConfig, data])

  // Get pending changes for save
  const pendingChanges = useMemo(() => {
    if (!localConfig || !data?.data?.config) return {}

    const changes: Record<string, boolean | number | string | string[]> = {}
    for (const key of Object.keys(localConfig)) {
      const localValue = localConfig[key]?.value
      const serverValue = data.data.config[key]?.value
      if (JSON.stringify(localValue) !== JSON.stringify(serverValue)) {
        changes[key] = localValue
      }
    }
    return changes
  }, [localConfig, data])

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dutySettings'] })
    setLocalConfig(null) // Reset local state to sync with server
  }

  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) return

    try {
      await updateMutation.mutateAsync(pendingChanges)
    } catch {
      // Error handled by mutation state
    }
  }

  const handleReset = async () => {
    try {
      await resetMutation.mutateAsync()
      setShowResetConfirm(false)
      setLocalConfig(null)
    } catch {
      // Error handled by mutation state
    }
  }

  const handleConfigChange = (key: string, value: boolean | number | string | string[]) => {
    if (!localConfig) return
    setLocalConfig({
      ...localConfig,
      [key]: {
        ...localConfig[key],
        value,
      },
    })
  }

  const config = localConfig || data?.data?.config
  const categories = data?.data?.categories

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Error Loading Settings</h2>
          <p className="text-gray-400">
            {(error as Error).message || 'Failed to load duty settings. Please try again.'}
          </p>
          <button
            onClick={handleRefresh}
            className="mt-4 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="w-7 h-7 text-discord-blurple" />
            Duty Settings
          </h1>
          <p className="text-gray-400 mt-1">
            Configure auto-timeout, activity tracking, and point values
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 bg-discord-darker hover:bg-discord-lighter text-gray-300 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              title="Reset to defaults"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className="flex items-center gap-2 bg-discord-lighter hover:bg-discord-light text-gray-300 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
              className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      {/* Read-only notice for non-admins */}
      {!canEdit && (
        <div className="bg-discord-blurple/20 border border-discord-blurple/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-discord-blurple" />
          <p className="text-sm text-gray-300">
            You can view duty settings for transparency, but only super admins can modify them.
          </p>
        </div>
      )}

      {/* Unsaved changes warning */}
      {canEdit && hasChanges && (
        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500" />
          <p className="text-sm text-yellow-200">
            You have unsaved changes. Click "Save Changes" to apply them.
          </p>
        </div>
      )}

      {/* Success/Error Messages */}
      {updateMutation.isSuccess && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
          <p className="text-sm text-green-400">Settings saved successfully!</p>
        </div>
      )}

      {updateMutation.error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-400">
            {(updateMutation.error as Error).message || 'Failed to save settings'}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
        </div>
      ) : config && categories ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Render each category */}
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
                    value={config[key]?.value ?? item.value}
                    onChange={handleConfigChange}
                    disabled={!canEdit}
                    voiceChannels={voiceChannels}
                  />
                ))}
              </SettingsSection>
            )
          })}

          {/* Activity Target Calculator */}
          <div className="lg:col-span-2">
            <SettingsSection
              title="Activity Target Calculator"
              icon={Target}
              description="Plan your weekly activity to meet your points goal"
            >
              <ActivityTargetCalculator
                weeklyTarget={typeof config?.weekly_points_target?.value === 'number' ? config.weekly_points_target.value : 1000}
                pointValues={{
                  base_per_minute: typeof config?.points_base_per_minute?.value === 'number' ? config.points_base_per_minute.value : 1,
                  voice_per_minute: typeof config?.points_voice_per_minute?.value === 'number' ? config.points_voice_per_minute.value : 0.5,
                  ticket_response: typeof config?.points_ticket_response?.value === 'number' ? config.points_ticket_response.value : 5,
                  admin_cam: typeof config?.points_admin_cam?.value === 'number' ? config.points_admin_cam.value : 3,
                  ingame_chat: typeof config?.points_ingame_chat?.value === 'number' ? config.points_ingame_chat.value : 1,
                  on_duty_multiplier: typeof config?.on_duty_multiplier?.value === 'number' ? config.on_duty_multiplier.value : 1.0,
                }}
              />
            </SettingsSection>
          </div>

          {/* Audit Log */}
          <div className="lg:col-span-2">
            <SettingsSection
              title="Recent Changes"
              icon={History}
              description="Audit log of recent settings modifications"
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
                          <span className="text-white font-medium">{entry.changedByName || 'Unknown'}</span>
                          {entry.changeType === 'enable' || entry.changeType === 'disable' ? (
                            <> {entry.changeType}d </>
                          ) : (
                            <> changed </>
                          )}
                          <code className="text-discord-blurple bg-discord-blurple/20 px-1 rounded">
                            {entry.configKey}
                          </code>
                        </span>
                        {entry.changeType === 'update' && (
                          <div className="text-gray-500 text-xs mt-1">
                            {isVoiceChannelConfig(entry.configKey) ? (
                              (() => {
                                const changes = formatVoiceChannelChange(entry.oldValue, entry.newValue, voiceChannels)
                                if (changes) {
                                  return (
                                    <div className="space-y-0.5">
                                      {changes.added.length > 0 && (
                                        <div className="text-green-400">Added: {changes.added.join(', ')}</div>
                                      )}
                                      {changes.removed.length > 0 && (
                                        <div className="text-red-400">Removed: {changes.removed.join(', ')}</div>
                                      )}
                                      {changes.added.length === 0 && changes.removed.length === 0 && (
                                        <span className="text-gray-500">No changes</span>
                                      )}
                                    </div>
                                  )
                                }
                                return (
                                  <>
                                    <span className="line-through">{entry.oldValue}</span>
                                    {' → '}
                                    <span className="text-green-400">{entry.newValue}</span>
                                  </>
                                )
                              })()
                            ) : (
                              <>
                                <span className="line-through">{entry.oldValue}</span>
                                {' → '}
                                <span className="text-green-400">{entry.newValue}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-gray-500 text-xs">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No recent changes recorded.</p>
              )}
            </SettingsSection>
          </div>
        </div>
      ) : null}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Reset Duty Settings?</h3>
            <p className="text-gray-400 text-sm mb-4">
              This will reset all duty settings to their default values.
              Auto-timeout, point values, and tracking preferences will be restored to defaults.
            </p>

            {resetMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(resetMutation.error as Error).message || 'Failed to reset settings'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Resetting...' : 'Reset to Defaults'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
