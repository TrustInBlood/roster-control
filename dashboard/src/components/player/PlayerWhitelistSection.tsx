import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { usePlayerWhitelistHistory } from '../../hooks/usePlayers'
import {
  useExtendWhitelist,
  useRevokeWhitelist,
  useRevokeWhitelistEntry,
  useEditWhitelistEntry
} from '../../hooks/useWhitelist'
import type { PlayerProfile, PlayerWhitelistEntry } from '../../types/player'
import type { ExtendWhitelistRequest, RevokeWhitelistRequest, EditWhitelistRequest } from '../../types/whitelist'
import { cn, formatDateTime, getStatusColor, getSourceColor } from '../../lib/utils'

interface PlayerWhitelistSectionProps {
  steamid64: string
  profile: PlayerProfile
}

export default function PlayerWhitelistSection({ steamid64, profile }: PlayerWhitelistSectionProps) {
  const { data, isLoading } = usePlayerWhitelistHistory(steamid64)

  const [showAddModal, setShowAddModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [showRevokeEntryModal, setShowRevokeEntryModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<PlayerWhitelistEntry | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  const entries = data?.entries || []
  const hasActiveEntry = entries.some(e => e.status === 'active' || e.status === 'permanent')

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">
          Whitelist History
          <span className="text-sm text-gray-400 ml-2">({entries.length} entries)</span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const activeEntry = entries.find(e => e.status === 'active' || e.status === 'permanent')
              if (activeEntry) {
                setSelectedEntry(activeEntry)
              }
              setShowAddModal(true)
            }}
            className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Whitelist
          </button>
          {hasActiveEntry && (
            <button
              onClick={() => setShowRevokeModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Revoke All
            </button>
          )}
        </div>
      </div>

      {/* Entries List */}
      {entries.length === 0 ? (
        <div className="bg-discord-light rounded-lg p-8 text-center">
          <p className="text-gray-400">No whitelist entries found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'p-3 rounded-lg border bg-discord-light',
                entry.revoked
                  ? 'border-red-500/30'
                  : entry.status === 'active' || entry.status === 'permanent'
                  ? 'border-green-500/30'
                  : 'border-discord-lighter'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                        getStatusColor(entry.status)
                      )}
                    >
                      {entry.status}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                        getSourceColor(entry.source)
                      )}
                    >
                      {entry.source || 'unknown'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">
                    {entry.reason || 'No reason specified'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Granted {formatDateTime(entry.granted_at)} by {entry.granted_by || 'Unknown'}
                  </p>
                  {entry.duration_value && (
                    <p className="text-xs text-gray-500">
                      Duration: {entry.duration_value} {entry.duration_type}
                    </p>
                  )}
                  {!entry.duration_value && !entry.revoked && (
                    <p className="text-xs text-gray-500">Duration: Permanent</p>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  {entry.revoked ? (
                    <div className="text-right">
                      <p className="text-xs text-red-400">Revoked</p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(entry.revoked_at)}
                      </p>
                      <p className="text-xs text-gray-500">by {entry.revoked_by}</p>
                      {entry.revoked_reason && (
                        <p className="text-xs text-gray-400 mt-1">
                          Reason: {entry.revoked_reason}
                        </p>
                      )}
                    </div>
                  ) : entry.source !== 'role' && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setSelectedEntry(entry)
                          setShowEditModal(true)
                        }}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-discord-lighter rounded transition-colors"
                        title="Edit entry"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedEntry(entry)
                          setShowRevokeEntryModal(true)
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-discord-lighter rounded transition-colors"
                        title="Revoke entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddWhitelistModal
          steamid64={steamid64}
          existingEntry={selectedEntry}
          onClose={() => {
            setShowAddModal(false)
            setSelectedEntry(null)
          }}
        />
      )}

      {showEditModal && selectedEntry && (
        <EditModal
          entry={selectedEntry}
          onClose={() => {
            setShowEditModal(false)
            setSelectedEntry(null)
          }}
        />
      )}

      {showRevokeEntryModal && selectedEntry && (
        <RevokeEntryModal
          entry={selectedEntry}
          onClose={() => {
            setShowRevokeEntryModal(false)
            setSelectedEntry(null)
          }}
        />
      )}

      {showRevokeModal && (
        <RevokeModal
          steamid64={steamid64}
          onClose={() => setShowRevokeModal(false)}
        />
      )}
    </div>
  )
}

// Modal Components (simplified versions)
function AddWhitelistModal({
  steamid64,
  existingEntry,
  onClose,
}: {
  steamid64: string
  existingEntry: PlayerWhitelistEntry | null
  onClose: () => void
}) {
  const extendMutation = useExtendWhitelist()
  const [duration, setDuration] = useState<{ value: number; type: 'days' | 'months' | 'hours' }>({ value: 1, type: 'months' })
  const [note, setNote] = useState('')
  const [isPermanent, setIsPermanent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!existingEntry) return

    const request: ExtendWhitelistRequest = {
      duration_value: isPermanent ? 0 : duration.value,
      duration_type: isPermanent ? 'days' : duration.type,
      note: note || undefined,
    }
    try {
      await extendMutation.mutateAsync({ id: existingEntry.id, request })
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Add Whitelist</h3>
        <p className="text-sm text-gray-400 mb-4">Add additional whitelist time for {steamid64}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="permanent"
              checked={isPermanent}
              onChange={(e) => setIsPermanent(e.target.checked)}
              className="rounded border-discord-lighter bg-discord-darker"
            />
            <label htmlFor="permanent" className="text-sm text-gray-300">Permanent</label>
          </div>
          {!isPermanent && (
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={duration.value}
                onChange={(e) => setDuration({ ...duration, value: parseInt(e.target.value) || 1 })}
                className="w-24 bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white"
              />
              <select
                value={duration.type}
                onChange={(e) => setDuration({ ...duration, type: e.target.value as 'days' | 'months' | 'hours' })}
                className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white"
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="months">Months</option>
              </select>
            </div>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
            className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">Cancel</button>
            <button
              type="submit"
              disabled={extendMutation.isPending}
              className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {extendMutation.isPending ? 'Adding...' : 'Add Whitelist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditModal({ entry, onClose }: { entry: PlayerWhitelistEntry; onClose: () => void }) {
  const editMutation = useEditWhitelistEntry()
  const [reason, setReason] = useState(entry.reason || '')
  const [duration, setDuration] = useState({ value: entry.duration_value || 1, type: entry.duration_type || 'months' as const })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const request: EditWhitelistRequest = { reason, duration_value: duration.value, duration_type: duration.type }
    try {
      await editMutation.mutateAsync({ id: entry.id, request })
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Edit Entry</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            rows={2}
            className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              value={duration.value}
              onChange={(e) => setDuration({ ...duration, value: parseInt(e.target.value) || 1 })}
              className="w-24 bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white"
            />
            <select
              value={duration.type}
              onChange={(e) => setDuration({ ...duration, type: e.target.value as 'days' | 'months' | 'hours' })}
              className="bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white"
            >
              <option value="hours">Hours</option>
              <option value="days">Days</option>
              <option value="months">Months</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">Cancel</button>
            <button
              type="submit"
              disabled={editMutation.isPending}
              className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {editMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RevokeEntryModal({ entry, onClose }: { entry: PlayerWhitelistEntry; onClose: () => void }) {
  const revokeMutation = useRevokeWhitelistEntry()
  const [reason, setReason] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await revokeMutation.mutateAsync({ id: entry.id, reason: reason || undefined })
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Revoke Entry</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
            className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">Cancel</button>
            <button
              type="submit"
              disabled={revokeMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {revokeMutation.isPending ? 'Revoking...' : 'Revoke'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RevokeModal({ steamid64, onClose }: { steamid64: string; onClose: () => void }) {
  const revokeMutation = useRevokeWhitelist()
  const [reason, setReason] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) return
    const request: RevokeWhitelistRequest = { reason }
    try {
      await revokeMutation.mutateAsync({ steamid64, request })
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Revoke All Whitelist</h3>
        <p className="text-sm text-gray-400 mb-4">This will revoke all non-role-based whitelist entries.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            rows={2}
            required
            className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">Cancel</button>
            <button
              type="submit"
              disabled={revokeMutation.isPending || !reason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {revokeMutation.isPending ? 'Revoking...' : 'Revoke All'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

