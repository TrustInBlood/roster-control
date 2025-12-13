import { X, CheckCircle, XCircle, Copy } from 'lucide-react'
import type { AuditLogEntry } from '../../types/audit'
import { cn, formatDateTime, getSeverityColor, formatActionType, copyToClipboard } from '../../lib/utils'

interface AuditDetailModalProps {
  entry: AuditLogEntry
  onClose: () => void
}

export default function AuditDetailModal({ entry, onClose }: AuditDetailModalProps) {
  const handleCopy = async (text: string) => {
    await copyToClipboard(text)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-discord-dark rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-discord-lighter">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">
              {formatActionType(entry.actionType)}
            </h2>
            {entry.success ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase">Time</label>
              <p className="text-sm text-white">{formatDateTime(entry.createdAt)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase">Severity</label>
              <p>
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                    getSeverityColor(entry.severity)
                  )}
                >
                  {entry.severity}
                </span>
              </p>
            </div>
          </div>

          {/* Actor/Target */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase">Actor</label>
              <p className="text-sm text-white">
                {entry.actorDisplayName || entry.actorName || '-'}
              </p>
              {entry.actorId && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  {entry.actorId}
                  <button
                    onClick={() => handleCopy(entry.actorId)}
                    className="hover:text-white transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </p>
              )}
              {entry.actorType && (
                <p className="text-xs text-gray-500">{entry.actorType}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase">Target</label>
              <p className="text-sm text-white">
                {entry.targetDisplayName || entry.targetName || '-'}
              </p>
              {entry.targetId && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  {entry.targetId}
                  <button
                    onClick={() => handleCopy(entry.targetId)}
                    className="hover:text-white transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </p>
              )}
              {entry.targetType && (
                <p className="text-xs text-gray-500">{entry.targetType}</p>
              )}
            </div>
          </div>

          {/* Description */}
          {entry.description && (
            <div>
              <label className="text-xs text-gray-400 uppercase">Description</label>
              <p className="text-sm text-white bg-discord-lighter rounded p-2 mt-1">
                {entry.description}
              </p>
            </div>
          )}

          {/* Error Message */}
          {entry.errorMessage && (
            <div>
              <label className="text-xs text-red-400 uppercase">Error</label>
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2 mt-1">
                {entry.errorMessage}
              </p>
            </div>
          )}

          {/* Before State */}
          {entry.beforeState && Object.keys(entry.beforeState).length > 0 && (
            <div>
              <label className="text-xs text-gray-400 uppercase">Before State</label>
              <pre className="text-xs text-gray-300 bg-discord-lighter rounded p-2 mt-1 overflow-x-auto">
                {JSON.stringify(entry.beforeState, null, 2)}
              </pre>
            </div>
          )}

          {/* After State */}
          {entry.afterState && Object.keys(entry.afterState).length > 0 && (
            <div>
              <label className="text-xs text-gray-400 uppercase">After State</label>
              <pre className="text-xs text-gray-300 bg-discord-lighter rounded p-2 mt-1 overflow-x-auto">
                {JSON.stringify(entry.afterState, null, 2)}
              </pre>
            </div>
          )}

          {/* Metadata */}
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <label className="text-xs text-gray-400 uppercase">Metadata</label>
              <pre className="text-xs text-gray-300 bg-discord-lighter rounded p-2 mt-1 overflow-x-auto">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* Action ID */}
          <div className="pt-2 border-t border-discord-lighter">
            <label className="text-xs text-gray-400 uppercase">Action ID</label>
            <p className="text-xs text-gray-500 font-mono flex items-center gap-1">
              {entry.actionId}
              <button
                onClick={() => handleCopy(entry.actionId)}
                className="hover:text-white transition-colors"
              >
                <Copy className="w-3 h-3" />
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-discord-lighter flex justify-end">
          <button
            onClick={onClose}
            className="bg-discord-lighter hover:bg-discord-light text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
