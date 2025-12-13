import { useState } from 'react'
import { RefreshCw, Shield, RotateCcw } from 'lucide-react'
import { usePermissions, useResetPermissions } from '../hooks/usePermissions'
import { useQueryClient } from '@tanstack/react-query'
import PermissionsTable from '../components/permissions/PermissionsTable'
import PermissionEditModal from '../components/permissions/PermissionEditModal'
import type { Permission } from '../types/permissions'

export default function Permissions() {
  const queryClient = useQueryClient()
  const { data, isLoading, isRefetching } = usePermissions()
  const resetMutation = useResetPermissions()

  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['permissions'] })
  }

  const handleReset = async () => {
    try {
      await resetMutation.mutateAsync()
      setShowResetConfirm(false)
    } catch {
      // Error handled by mutation state
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-discord-blurple" />
            Permission Management
          </h1>
          <p className="text-gray-400 mt-1">
            Configure which Discord roles can access each dashboard feature
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 bg-discord-darker hover:bg-discord-lighter text-gray-300 px-4 py-2 rounded-md text-sm font-medium transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefetching}
            className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-discord-light rounded-lg p-4 border-l-4 border-discord-blurple">
        <p className="text-sm text-gray-300">
          Click on a permission row to edit which roles have access to that feature.
          Changes take effect immediately and are cached for 5 minutes.
        </p>
      </div>

      {/* Permissions Table */}
      <div className="bg-discord-light rounded-lg">
        <PermissionsTable
          permissions={data?.permissions || []}
          isLoading={isLoading}
          onRowClick={setSelectedPermission}
        />
      </div>

      {/* Edit Modal */}
      {selectedPermission && (
        <PermissionEditModal
          permission={selectedPermission}
          onClose={() => setSelectedPermission(null)}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Reset Permissions?</h3>
            <p className="text-gray-400 text-sm mb-4">
              This will reset all permission assignments to their default values.
              Any custom role assignments will be lost.
            </p>

            {resetMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(resetMutation.error as Error).message || 'Failed to reset permissions'}
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
