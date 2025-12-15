import { useState } from 'react'
import { Shield, Plus, RefreshCw, RotateCcw, Users } from 'lucide-react'
import { useSquadGroups, useRemoveSquadRole, useResetSquadGroups, useSyncSquadGroups } from '../hooks/useSquadGroups'
import SquadGroupsTable from '../components/squadgroups/SquadGroupsTable'
import SquadGroupEditModal from '../components/squadgroups/SquadGroupEditModal'
import AddSquadRoleModal from '../components/squadgroups/AddSquadRoleModal'
import type { RoleConfig } from '../types/squadgroups'

export default function SquadGroups() {
  const { data, isLoading, refetch, isRefetching } = useSquadGroups()
  const removeMutation = useRemoveSquadRole()
  const resetMutation = useResetSquadGroups()
  const syncMutation = useSyncSquadGroups()

  const [editingRole, setEditingRole] = useState<RoleConfig | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<RoleConfig | null>(null)

  const handleRowClick = (roleConfig: RoleConfig) => {
    setEditingRole(roleConfig)
  }

  const handleDelete = (roleConfig: RoleConfig) => {
    setDeleteConfirm(roleConfig)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return

    try {
      await removeMutation.mutateAsync(deleteConfirm.roleId)
      setDeleteConfirm(null)
    } catch {
      // Error handled by mutation state
    }
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
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold text-white">Squad Groups</h1>
            <p className="text-gray-400 text-sm">
              Configure Discord roles and their Squad server permissions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white bg-discord-darker hover:bg-discord-lighter rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-green-400 bg-discord-darker hover:bg-discord-lighter rounded-md transition-colors disabled:opacity-50"
            title="Sync all members with tracked roles"
          >
            <Users className={`w-4 h-4 ${syncMutation.isPending ? 'animate-pulse' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync All'}
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-orange-400 bg-discord-darker hover:bg-discord-lighter rounded-md transition-colors"
            title="Reset to config defaults"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Role
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-discord-light rounded-lg p-4 border border-discord-lighter">
        <div className="flex items-start gap-3">
          <div className="bg-discord-blurple/20 p-2 rounded-lg">
            <Shield className="w-5 h-5 text-discord-blurple" />
          </div>
          <div>
            <h3 className="text-white font-medium mb-1">How Squad Groups Work</h3>
            <p className="text-gray-400 text-sm">
              Each Discord role can be mapped to a Squad server group with specific permissions.
              When a member has multiple configured roles, the role with the highest Discord position
              determines their Squad group. The group name is used in the Squad whitelist file.
            </p>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-discord-light rounded-lg border border-discord-lighter overflow-hidden">
        <SquadGroupsTable
          roleConfigs={data?.roleConfigs || []}
          squadPermissions={data?.squadPermissions || []}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          onDelete={handleDelete}
        />
      </div>

      {/* Edit Modal */}
      {editingRole && data && (
        <SquadGroupEditModal
          roleConfig={editingRole}
          squadPermissions={data.squadPermissions}
          onClose={() => setEditingRole(null)}
        />
      )}

      {/* Add Modal */}
      {showAddModal && data && (
        <AddSquadRoleModal
          squadPermissions={data.squadPermissions}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Remove Role from Squad Groups?
            </h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to remove <span className="text-white font-medium">{deleteConfirm.roleName}</span> from
              Squad Groups? This will revoke all Squad permissions for users with this role.
            </p>

            {removeMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(removeMutation.error as Error).message || 'Failed to remove role'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={removeMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {removeMutation.isPending ? 'Removing...' : 'Remove Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Reset Squad Groups to Defaults?
            </h3>
            <p className="text-gray-400 mb-4">
              This will remove all current Squad Group configurations and re-seed from the
              config file defaults. This action cannot be undone.
            </p>

            {resetMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(resetMutation.error as Error).message || 'Failed to reset'}
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
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
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
