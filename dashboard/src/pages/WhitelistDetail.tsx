import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Plus, Trash2, Clock, User, Shield, History } from 'lucide-react'
import { useWhitelistDetail, useExtendWhitelist, useRevokeWhitelist } from '../hooks/useWhitelist'
import { cn, formatDateTime, formatRelativeTime, getStatusColor, getSourceColor, copyToClipboard } from '../lib/utils'
import type { ExtendWhitelistRequest, RevokeWhitelistRequest } from '../types/whitelist'

export default function WhitelistDetail() {
  const { steamid64 } = useParams<{ steamid64: string }>()
  const navigate = useNavigate()
  const { data, isLoading, error } = useWhitelistDetail(steamid64!)

  const [showExtendModal, setShowExtendModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null)

  const handleCopy = async (text: string) => {
    await copyToClipboard(text)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load whitelist details</p>
        <Link to="/whitelist" className="text-discord-blurple hover:underline mt-2 inline-block">
          Back to whitelist
        </Link>
      </div>
    )
  }

  const { user, currentStatus, accountLink, history } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/whitelist"
          className="text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Whitelist Details</h1>
          <p className="text-gray-400 flex items-center gap-2">
            <code className="text-blue-400 font-mono">{steamid64}</code>
            <button
              onClick={() => handleCopy(steamid64!)}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </p>
        </div>
        {currentStatus.isActive && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                const activeEntry = history.find(e => e.status === 'active' || e.status === 'permanent')
                if (activeEntry) {
                  setSelectedEntryId(activeEntry.id)
                  setShowExtendModal(true)
                }
              }}
              className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Extend
            </button>
            <button
              onClick={() => setShowRevokeModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Revoke
            </button>
          </div>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* User Info */}
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-5 h-5 text-gray-400" />
            <h3 className="font-medium text-white">User Info</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-400">Username</dt>
              <dd className="text-white">{user.username || 'Unknown'}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Discord</dt>
              <dd className="text-white">{user.discord_username || 'Not linked'}</dd>
            </div>
            <div>
              <dt className="text-gray-400">EOS ID</dt>
              <dd className="text-white font-mono text-xs">{user.eosID || 'N/A'}</dd>
            </div>
          </dl>
        </div>

        {/* Current Status */}
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-gray-400" />
            <h3 className="font-medium text-white">Current Status</h3>
          </div>
          <div className="space-y-3">
            <span
              className={cn(
                'inline-flex items-center px-3 py-1 rounded text-sm font-medium border',
                getStatusColor(currentStatus.status)
              )}
            >
              {currentStatus.status}
            </span>
            {currentStatus.isActive && !currentStatus.isPermanent && currentStatus.expiration && (
              <p className="text-sm text-gray-300">
                Expires {formatRelativeTime(currentStatus.expiration)}
                <br />
                <span className="text-gray-500">{formatDateTime(currentStatus.expiration)}</span>
              </p>
            )}
            {currentStatus.isPermanent && (
              <p className="text-sm text-gray-300">No expiration</p>
            )}
          </div>
        </div>

        {/* Account Link */}
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-gray-400" />
            <h3 className="font-medium text-white">Account Link</h3>
          </div>
          {accountLink ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-400">Confidence</dt>
                <dd className="text-white">
                  <span className={cn(
                    'font-medium',
                    accountLink.confidence_score >= 1.0 ? 'text-green-400' :
                    accountLink.confidence_score >= 0.7 ? 'text-yellow-400' : 'text-red-400'
                  )}>
                    {(accountLink.confidence_score * 100).toFixed(0)}%
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Source</dt>
                <dd className="text-white capitalize">{accountLink.link_source}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Primary</dt>
                <dd className="text-white">{accountLink.is_primary ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-400">No account link found</p>
          )}
        </div>
      </div>

      {/* History */}
      <div className="bg-discord-light rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-gray-400" />
          <h3 className="font-medium text-white">Whitelist History</h3>
          <span className="text-sm text-gray-400">({history.length} entries)</span>
        </div>
        <div className="space-y-3">
          {history.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'p-3 rounded-lg border',
                entry.revoked
                  ? 'bg-red-500/10 border-red-500/30'
                  : entry.status === 'active' || entry.status === 'permanent'
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-discord-darker border-discord-lighter'
              )}
            >
              <div className="flex items-start justify-between">
                <div>
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
                </div>
                {entry.revoked && (
                  <div className="text-right">
                    <p className="text-xs text-red-400">Revoked</p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(entry.revoked_at)}
                    </p>
                    <p className="text-xs text-gray-500">
                      by {entry.revoked_by}
                    </p>
                    {entry.revoked_reason && (
                      <p className="text-xs text-gray-400 mt-1">
                        Reason: {entry.revoked_reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extend Modal */}
      {showExtendModal && selectedEntryId && (
        <ExtendModal
          entryId={selectedEntryId}
          onClose={() => {
            setShowExtendModal(false)
            setSelectedEntryId(null)
          }}
          onSuccess={() => {
            setShowExtendModal(false)
            setSelectedEntryId(null)
          }}
        />
      )}

      {/* Revoke Modal */}
      {showRevokeModal && (
        <RevokeModal
          steamid64={steamid64!}
          onClose={() => setShowRevokeModal(false)}
          onSuccess={() => {
            setShowRevokeModal(false)
            navigate('/whitelist')
          }}
        />
      )}
    </div>
  )
}

// Extend Modal Component
function ExtendModal({
  entryId,
  onClose,
  onSuccess,
}: {
  entryId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const extendMutation = useExtendWhitelist()
  const [duration, setDuration] = useState<{ value: number; type: 'days' | 'months' | 'hours' }>({ value: 1, type: 'months' })
  const [note, setNote] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const request: ExtendWhitelistRequest = {
      duration_value: duration.value,
      duration_type: duration.type,
      note: note || undefined,
    }
    try {
      await extendMutation.mutateAsync({ id: entryId, request })
      onSuccess()
    } catch {
      // Error handled by mutation state
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Extend Whitelist</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            rows={2}
            className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
          />
          {extendMutation.error && (
            <p className="text-sm text-red-400">{(extendMutation.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
              Cancel
            </button>
            <button
              type="submit"
              disabled={extendMutation.isPending}
              className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {extendMutation.isPending ? 'Extending...' : 'Extend'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Revoke Modal Component
function RevokeModal({
  steamid64,
  onClose,
  onSuccess,
}: {
  steamid64: string
  onClose: () => void
  onSuccess: () => void
}) {
  const revokeMutation = useRevokeWhitelist()
  const [reason, setReason] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) return

    const request: RevokeWhitelistRequest = { reason }
    try {
      await revokeMutation.mutateAsync({ steamid64, request })
      onSuccess()
    } catch {
      // Error handled by mutation state
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Revoke Whitelist</h3>
        <p className="text-sm text-gray-400 mb-4">
          This will revoke all non-role-based whitelist entries for this user.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for revocation (required)"
            rows={3}
            required
            className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none"
          />
          {revokeMutation.error && (
            <p className="text-sm text-red-400">{(revokeMutation.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
              Cancel
            </button>
            <button
              type="submit"
              disabled={revokeMutation.isPending || !reason.trim()}
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
