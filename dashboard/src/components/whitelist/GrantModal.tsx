import { useState } from 'react'
import { X } from 'lucide-react'
import { useGrantWhitelist } from '../../hooks/useWhitelist'
import type { GrantWhitelistRequest } from '../../types/whitelist'

interface GrantModalProps {
  onClose: () => void
}

const DURATION_PRESETS = [
  { label: '7 Days', value: 7, type: 'days' as const },
  { label: '1 Month', value: 1, type: 'months' as const },
  { label: '3 Months', value: 3, type: 'months' as const },
  { label: '6 Months', value: 6, type: 'months' as const },
  { label: '1 Year', value: 12, type: 'months' as const },
  { label: 'Permanent', value: null, type: null },
]

const REASONS = [
  'donator',
  'service-member',
  'first-responder',
  'reporting',
  'contest-winner',
  'other',
]

export default function GrantModal({ onClose }: GrantModalProps) {
  const grantMutation = useGrantWhitelist()

  const [formData, setFormData] = useState({
    steamid64: '',
    username: '',
    discord_username: '',
    reason: '',
    duration_value: 1 as number | null,
    duration_type: 'months' as 'days' | 'months' | 'hours' | null,
    note: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.steamid64) {
      newErrors.steamid64 = 'Steam ID is required'
    } else if (!/^7656\d{13}$/.test(formData.steamid64)) {
      newErrors.steamid64 = 'Invalid Steam64 ID format (should be 17 digits starting with 7656)'
    }

    if (!formData.reason) {
      newErrors.reason = 'Reason is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    const request: GrantWhitelistRequest = {
      steamid64: formData.steamid64,
      username: formData.username || undefined,
      discord_username: formData.discord_username || undefined,
      reason: formData.reason,
      duration_value: formData.duration_value,
      duration_type: formData.duration_type,
      note: formData.note || undefined,
    }

    try {
      await grantMutation.mutateAsync(request)
      onClose()
    } catch {
      // Error is handled by mutation state
    }
  }

  const handleDurationPreset = (preset: typeof DURATION_PRESETS[0]) => {
    setFormData({
      ...formData,
      duration_value: preset.value,
      duration_type: preset.type,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-discord-lighter">
          <h2 className="text-lg font-semibold text-white">Grant Whitelist</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Steam ID */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Steam64 ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.steamid64}
              onChange={(e) => setFormData({ ...formData, steamid64: e.target.value })}
              placeholder="76561198000000000"
              className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
            />
            {errors.steamid64 && (
              <p className="text-red-400 text-xs mt-1">{errors.steamid64}</p>
            )}
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              In-game Username (optional)
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="Player username"
              className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
            />
          </div>

          {/* Discord Username */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Discord Username (optional)
            </label>
            <input
              type="text"
              value={formData.discord_username}
              onChange={(e) => setFormData({ ...formData, discord_username: e.target.value })}
              placeholder="username#0000 or @username"
              className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Reason <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="">Select a reason</option>
              {REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
            {errors.reason && (
              <p className="text-red-400 text-xs mt-1">{errors.reason}</p>
            )}
          </div>

          {/* Duration Presets */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Duration
            </label>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleDurationPreset(preset)}
                  className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                    formData.duration_value === preset.value && formData.duration_type === preset.type
                      ? 'bg-discord-blurple border-discord-blurple text-white'
                      : 'bg-discord-darker border-discord-lighter text-gray-300 hover:border-discord-blurple'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Duration */}
            {formData.duration_value !== null && (
              <div className="flex gap-2 mt-3">
                <input
                  type="number"
                  min="1"
                  value={formData.duration_value || ''}
                  onChange={(e) => setFormData({ ...formData, duration_value: parseInt(e.target.value) || 1 })}
                  className="w-24 bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
                />
                <select
                  value={formData.duration_type || 'months'}
                  onChange={(e) => setFormData({ ...formData, duration_type: e.target.value as 'days' | 'months' | 'hours' })}
                  className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Note (optional)
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
              className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple resize-none"
            />
          </div>

          {/* Error Message */}
          {grantMutation.error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3">
              <p className="text-sm text-red-400">
                {(grantMutation.error as Error).message || 'Failed to grant whitelist'}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-discord-lighter">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={grantMutation.isPending}
              className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {grantMutation.isPending ? 'Granting...' : 'Grant Whitelist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
