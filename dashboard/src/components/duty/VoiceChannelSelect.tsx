import { useState } from 'react'
import { Volume2, X, ChevronDown, Check } from 'lucide-react'
import type { VoiceChannel } from '../../types/dutySettings'

interface VoiceChannelSelectProps {
  channels: VoiceChannel[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  label: string
  description?: string
}

export default function VoiceChannelSelect({
  channels,
  selectedIds,
  onChange,
  disabled,
  label,
  description,
}: VoiceChannelSelectProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Group channels by parent category
  const groupedChannels = channels.reduce(
    (acc, channel) => {
      const key = channel.parentName || 'No Category'
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(channel)
      return acc
    },
    {} as Record<string, VoiceChannel[]>
  )

  const toggleChannel = (channelId: string) => {
    if (disabled) return

    if (selectedIds.includes(channelId)) {
      onChange(selectedIds.filter((id) => id !== channelId))
    } else {
      onChange([...selectedIds, channelId])
    }
  }

  const removeChannel = (channelId: string) => {
    if (disabled) return
    onChange(selectedIds.filter((id) => id !== channelId))
  }

  const getChannelName = (channelId: string) => {
    return channels.find((c) => c.id === channelId)?.name || channelId
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-sm font-medium text-gray-300">{label}</label>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>

      {/* Selected channels pills */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 bg-discord-blurple/20 text-discord-blurple px-2.5 py-1 rounded-full text-sm"
            >
              <Volume2 className="w-3.5 h-3.5" />
              {getChannelName(id)}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeChannel(id)}
                  className="hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full flex items-center justify-between bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-left ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-discord-blurple cursor-pointer'
          }`}
        >
          <span className="text-gray-400 text-sm">
            {selectedIds.length === 0
              ? 'Select channels...'
              : `${selectedIds.length} channel${selectedIds.length > 1 ? 's' : ''} selected`}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

            {/* Dropdown menu */}
            <div className="absolute z-20 mt-1 w-full bg-discord-darker border border-discord-lighter rounded-md shadow-lg max-h-64 overflow-y-auto">
              {Object.entries(groupedChannels).map(([category, categoryChannels]) => (
                <div key={category}>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase bg-discord-light/50 sticky top-0">
                    {category}
                  </div>
                  {categoryChannels.map((channel) => {
                    const isSelected = selectedIds.includes(channel.id)
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => toggleChannel(channel.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-discord-lighter transition-colors ${
                          isSelected ? 'bg-discord-blurple/10' : ''
                        }`}
                      >
                        <Volume2 className="w-4 h-4 text-gray-400" />
                        <span className="flex-1 text-sm text-gray-200">{channel.name}</span>
                        {isSelected && <Check className="w-4 h-4 text-discord-blurple" />}
                      </button>
                    )
                  })}
                </div>
              ))}
              {channels.length === 0 && (
                <div className="px-3 py-4 text-center text-gray-500 text-sm">
                  No voice channels found
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
