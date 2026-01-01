import { useState, useEffect, useMemo } from 'react'
import { X, Check, Plus, Trash2, GripVertical, Eye } from 'lucide-react'
import { useCreateInfoButton, useUpdateInfoButton } from '../../hooks/useInfoButtons'
import type { InfoPostButton, InfoButtonEmbed, EmbedField } from '../../types/infoButtons'

interface InfoButtonEditModalProps {
  button: InfoPostButton | null // null = create mode
  onClose: () => void
}

// Predefined colors for Discord embeds
const EMBED_COLORS = [
  { name: 'Blurple', value: 0x5865F2 },
  { name: 'Green', value: 0x57F287 },
  { name: 'Yellow', value: 0xFEE75C },
  { name: 'Fuchsia', value: 0xEB459E },
  { name: 'Red', value: 0xED4245 },
  { name: 'White', value: 0xFFFFFF },
  { name: 'Teal', value: 0x2b82b2 },
]

/**
 * Replace channel placeholders with fake Discord channel mentions for preview
 */
function replaceChannelPlaceholdersForPreview(text: string, channels: Record<string, string>): string {
  if (!text) return text
  return text.replace(/\{#(\w+)\}/g, (match, key) => {
    if (channels[key]) {
      return `#${key}`
    }
    return match
  })
}

/**
 * Discord Embed Preview Component
 */
function EmbedPreview({
  embed,
  channels,
}: {
  embed: InfoButtonEmbed
  channels: Record<string, string>
}) {
  const colorHex = `#${embed.color.toString(16).padStart(6, '0')}`

  const processedDescription = useMemo(
    () => replaceChannelPlaceholdersForPreview(embed.description, channels),
    [embed.description, channels]
  )

  const processedFields = useMemo(
    () =>
      embed.fields?.map((field) => ({
        ...field,
        value: replaceChannelPlaceholdersForPreview(field.value, channels),
      })) || [],
    [embed.fields, channels]
  )

  // Group inline fields
  const fieldRows: EmbedField[][] = []
  let currentRow: EmbedField[] = []

  processedFields.forEach((field) => {
    if (field.inline && currentRow.length < 3) {
      currentRow.push(field)
    } else {
      if (currentRow.length > 0) {
        fieldRows.push(currentRow)
        currentRow = []
      }
      if (field.inline) {
        currentRow.push(field)
      } else {
        fieldRows.push([field])
      }
    }
  })
  if (currentRow.length > 0) {
    fieldRows.push(currentRow)
  }

  return (
    <div className="bg-[#2f3136] rounded-md overflow-hidden">
      <div className="flex">
        {/* Color bar */}
        <div className="w-1 flex-shrink-0" style={{ backgroundColor: colorHex }} />

        {/* Content */}
        <div className="p-3 flex-1 min-w-0">
          {/* Title */}
          {embed.title && (
            <div className="font-semibold text-white mb-1">{embed.title}</div>
          )}

          {/* Description */}
          {processedDescription && (
            <div className="text-sm text-gray-300 whitespace-pre-wrap mb-2">
              {processedDescription.split(/(#\w+)/).map((part, i) =>
                part.startsWith('#') ? (
                  <span key={i} className="text-[#00AFF4] bg-[#00AFF4]/10 rounded px-0.5">
                    {part}
                  </span>
                ) : (
                  part
                )
              )}
            </div>
          )}

          {/* Fields */}
          {fieldRows.length > 0 && (
            <div className="space-y-2 mt-2">
              {fieldRows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className={`grid gap-2 ${
                    row.length === 1
                      ? 'grid-cols-1'
                      : row.length === 2
                      ? 'grid-cols-2'
                      : 'grid-cols-3'
                  }`}
                >
                  {row.map((field, fieldIndex) => (
                    <div key={fieldIndex} className="min-w-0">
                      <div className="text-xs font-semibold text-white mb-0.5">
                        {field.name || 'Field Name'}
                      </div>
                      <div className="text-xs text-gray-300 whitespace-pre-wrap">
                        {field.value.split(/(#\w+)/).map((part, i) =>
                          part.startsWith('#') ? (
                            <span key={i} className="text-[#00AFF4] bg-[#00AFF4]/10 rounded px-0.5">
                              {part}
                            </span>
                          ) : (
                            part
                          )
                        ) || 'Field value'}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-700">
            Roster Control System
          </div>
        </div>
      </div>
    </div>
  )
}

export default function InfoButtonEditModal({
  button,
  onClose,
}: InfoButtonEditModalProps) {
  const createMutation = useCreateInfoButton()
  const updateMutation = useUpdateInfoButton()
  const isEditMode = !!button

  // Form state
  const [buttonId, setButtonId] = useState('')
  const [buttonLabel, setButtonLabel] = useState('')
  const [buttonEmoji, setButtonEmoji] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [embed, setEmbed] = useState<InfoButtonEmbed>({
    color: 0x2b82b2,
    title: '',
    description: '',
    fields: [],
  })
  const [channels, setChannels] = useState<Record<string, string>>({})
  const [newChannelKey, setNewChannelKey] = useState('')
  const [newChannelId, setNewChannelId] = useState('')

  // Initialize form with button data
  useEffect(() => {
    if (button) {
      setButtonId(button.button_id)
      setButtonLabel(button.button_label)
      setButtonEmoji(button.button_emoji || '')
      setEnabled(button.enabled)
      setEmbed(button.embed)
      setChannels(button.channels || {})
    } else {
      setButtonId('info_')
      setButtonLabel('')
      setButtonEmoji('')
      setEnabled(true)
      setEmbed({
        color: 0x2b82b2,
        title: '',
        description: '',
        fields: [],
      })
      setChannels({})
    }
  }, [button])

  const handleAddField = () => {
    setEmbed(prev => ({
      ...prev,
      fields: [...(prev.fields || []), { name: '', value: '', inline: false }],
    }))
  }

  const handleRemoveField = (index: number) => {
    setEmbed(prev => ({
      ...prev,
      fields: prev.fields?.filter((_, i) => i !== index) || [],
    }))
  }

  const handleFieldChange = (index: number, field: Partial<EmbedField>) => {
    setEmbed(prev => ({
      ...prev,
      fields: prev.fields?.map((f, i) => (i === index ? { ...f, ...field } : f)) || [],
    }))
  }

  const handleAddChannel = () => {
    if (newChannelKey && newChannelId) {
      setChannels(prev => ({
        ...prev,
        [newChannelKey]: newChannelId,
      }))
      setNewChannelKey('')
      setNewChannelId('')
    }
  }

  const handleRemoveChannel = (key: string) => {
    setChannels(prev => {
      const { [key]: _, ...rest } = prev
      return rest
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (isEditMode) {
        await updateMutation.mutateAsync({
          id: button.id,
          request: {
            button_label: buttonLabel,
            button_emoji: buttonEmoji || null,
            channels: Object.keys(channels).length > 0 ? channels : null,
            embed,
            enabled,
          },
        })
      } else {
        await createMutation.mutateAsync({
          button_id: buttonId,
          button_label: buttonLabel,
          button_emoji: buttonEmoji || null,
          channels: Object.keys(channels).length > 0 ? channels : null,
          embed,
          enabled,
        })
      }
      onClose()
    } catch {
      // Error handled by mutation state
    }
  }

  const mutation = isEditMode ? updateMutation : createMutation
  const isValid =
    buttonId.startsWith('info_') &&
    buttonId.length > 5 &&
    buttonLabel.trim() !== '' &&
    embed.title.trim() !== '' &&
    embed.description.trim() !== ''

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-discord-lighter">
          <h3 className="text-lg font-semibold text-white">
            {isEditMode ? 'Edit Info Button' : 'Create Info Button'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Two column layout */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 border-r border-discord-lighter">
            {/* Button Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Button ID
                </label>
                <input
                  type="text"
                  value={buttonId}
                  onChange={(e) => setButtonId(e.target.value)}
                  disabled={isEditMode}
                  placeholder="info_my_button"
                  className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Unique identifier (must start with "info_")
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Button Label
                </label>
                <input
                  type="text"
                  value={buttonLabel}
                  onChange={(e) => setButtonLabel(e.target.value)}
                  placeholder="My Button"
                  className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Text shown on the button
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Emoji (optional)
                </label>
                <input
                  type="text"
                  value={buttonEmoji}
                  onChange={(e) => setButtonEmoji(e.target.value)}
                  placeholder="e.g. or :emoji:"
                  className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Icon shown before the label
                </p>
              </div>

              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="w-4 h-4 bg-discord-darker border-discord-lighter rounded focus:ring-discord-blurple"
                  />
                  <span className="text-sm text-gray-300">Enabled</span>
                </label>
              </div>
            </div>

            {/* Embed Settings */}
            <div className="border-t border-discord-lighter pt-4">
              <h4 className="text-md font-medium text-white mb-1">Embed Content</h4>
              <p className="text-xs text-gray-500 mb-3">
                This is what users see when they click the button
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={embed.title}
                    onChange={(e) => setEmbed(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Embed title"
                    className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={embed.description}
                    onChange={(e) => setEmbed(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Main content of the embed. Supports basic markdown like **bold** and *italic*."
                    rows={4}
                    className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Accent Color
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    The colored bar on the left side of the embed
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {EMBED_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setEmbed(prev => ({ ...prev, color: color.value }))}
                        className={`w-8 h-8 rounded-md border-2 transition-colors ${
                          embed.color === color.value
                            ? 'border-white'
                            : 'border-transparent hover:border-gray-500'
                        }`}
                        style={{ backgroundColor: `#${color.value.toString(16).padStart(6, '0')}` }}
                        title={color.name}
                      />
                    ))}
                    <input
                      type="color"
                      value={`#${embed.color.toString(16).padStart(6, '0')}`}
                      onChange={(e) =>
                        setEmbed(prev => ({
                          ...prev,
                          color: parseInt(e.target.value.slice(1), 16),
                        }))
                      }
                      className="w-8 h-8 rounded-md border-0 cursor-pointer"
                      title="Custom color"
                    />
                  </div>
                </div>

                {/* Fields */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-300">Fields</label>
                    <button
                      type="button"
                      onClick={handleAddField}
                      className="flex items-center gap-1 text-xs text-discord-blurple hover:text-discord-blurple/80"
                    >
                      <Plus className="w-3 h-3" />
                      Add Field
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Additional sections with a title and content. "Inline" puts fields side-by-side.
                  </p>

                  <div className="space-y-2">
                    {embed.fields?.map((field, index) => (
                      <div
                        key={index}
                        className="bg-discord-darker rounded-md p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-gray-500" />
                          <input
                            type="text"
                            value={field.name}
                            onChange={(e) =>
                              handleFieldChange(index, { name: e.target.value })
                            }
                            placeholder="Field title"
                            className="flex-1 bg-discord-light border border-discord-lighter rounded-md px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
                          />
                          <label className="flex items-center gap-1 text-xs text-gray-400">
                            <input
                              type="checkbox"
                              checked={field.inline}
                              onChange={(e) =>
                                handleFieldChange(index, { inline: e.target.checked })
                              }
                              className="w-3 h-3"
                            />
                            Inline
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveField(index)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <textarea
                          value={field.value}
                          onChange={(e) =>
                            handleFieldChange(index, { value: e.target.value })
                          }
                          placeholder="Field content"
                          rows={2}
                          className="w-full bg-discord-light border border-discord-lighter rounded-md px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple resize-none"
                        />
                      </div>
                    ))}
                    {(!embed.fields || embed.fields.length === 0) && (
                      <p className="text-xs text-gray-500 italic">No fields added yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Channel Placeholders */}
            <div className="border-t border-discord-lighter pt-4">
              <h4 className="text-md font-medium text-white mb-1">Channel Placeholders</h4>
              <p className="text-xs text-gray-500 mb-3">
                Create shortcuts like <code className="bg-discord-darker px-1 rounded">{'{#support}'}</code> that become clickable channel links in Discord.
                Use them in the description or field content above.
              </p>

              <div className="space-y-2">
                {Object.entries(channels).map(([key, id]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 bg-discord-darker rounded-md px-3 py-2"
                  >
                    <code className="text-discord-blurple">{'{#' + key + '}'}</code>
                    <span className="text-gray-500">&rarr;</span>
                    <span className="text-gray-300 flex-1 font-mono text-sm">{id}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveChannel(key)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newChannelKey}
                    onChange={(e) => setNewChannelKey(e.target.value)}
                    placeholder="Key (e.g. support)"
                    className="flex-1 bg-discord-darker border border-discord-lighter rounded-md px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
                  />
                  <input
                    type="text"
                    value={newChannelId}
                    onChange={(e) => setNewChannelId(e.target.value)}
                    placeholder="Channel ID"
                    className="flex-1 bg-discord-darker border border-discord-lighter rounded-md px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
                  />
                  <button
                    type="button"
                    onClick={handleAddChannel}
                    disabled={!newChannelKey || !newChannelId}
                    className="text-discord-blurple hover:text-discord-blurple/80 disabled:opacity-50"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Error */}
            {mutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3">
                <p className="text-sm text-red-400">
                  {(mutation.error as Error).message || 'Failed to save button'}
                </p>
              </div>
            )}
          </form>

          {/* Right: Preview */}
          <div className="w-80 flex-shrink-0 p-4 overflow-y-auto bg-discord-darker">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-gray-400" />
              <h4 className="text-sm font-medium text-gray-300">Live Preview</h4>
            </div>

            {/* Button Preview */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2">Button appearance:</p>
              <div className="inline-flex items-center gap-2 bg-[#4f545c] hover:bg-[#5d6269] px-4 py-2 rounded text-sm text-white">
                {buttonEmoji && <span>{buttonEmoji}</span>}
                <span>{buttonLabel || 'Button Label'}</span>
              </div>
            </div>

            {/* Embed Preview */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Embed shown when clicked:</p>
              <EmbedPreview embed={embed} channels={channels} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-discord-lighter">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !isValid}
            className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? (
              'Saving...'
            ) : (
              <>
                <Check className="w-4 h-4" />
                {isEditMode ? 'Save Changes' : 'Create Button'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
