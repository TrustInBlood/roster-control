import { useState } from 'react'
import { Users, Plus, RefreshCw, RotateCcw, FolderPlus, ChevronRight, Trash2 } from 'lucide-react'
import {
  useDiscordRoles,
  useCreateDiscordRoleGroup,
  useDeleteDiscordRoleGroup,
  useCreateDiscordRole,
  useUpdateDiscordRole,
  useDeleteDiscordRole,
  useResetDiscordRoles,
  useAvailableDiscordRoles,
} from '../hooks/useDiscordRoles'
import type { DiscordRoleGroup, DiscordRoleEntry, CreateGroupRequest, CreateRoleRequest } from '../types/discordroles'

export default function DiscordRoles() {
  const { data, isLoading, refetch, isRefetching } = useDiscordRoles()
  const { data: availableRoles } = useAvailableDiscordRoles()
  const createGroupMutation = useCreateDiscordRoleGroup()
  const deleteGroupMutation = useDeleteDiscordRoleGroup()
  const createRoleMutation = useCreateDiscordRole()
  const updateRoleMutation = useUpdateDiscordRole()
  const deleteRoleMutation = useDeleteDiscordRole()
  const resetMutation = useResetDiscordRoles()

  const [selectedGroup, setSelectedGroup] = useState<DiscordRoleGroup | null>(null)
  const [showAddGroupModal, setShowAddGroupModal] = useState(false)
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<DiscordRoleGroup | null>(null)
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState<DiscordRoleEntry | null>(null)

  // Form states
  const [newGroupKey, setNewGroupKey] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#5865F2')

  const [selectedDiscordRole, setSelectedDiscordRole] = useState('')
  const [newRoleKey, setNewRoleKey] = useState('')
  const [newRoleDescription, setNewRoleDescription] = useState('')

  const roles = data?.roles || []
  const groups = data?.groups || []

  const rolesInSelectedGroup = selectedGroup
    ? roles.filter(r => r.groupId === selectedGroup.id)
    : []

  const handleCreateGroup = async () => {
    if (!newGroupKey || !newGroupName) return

    try {
      const request: CreateGroupRequest = {
        groupKey: newGroupKey,
        displayName: newGroupName,
        description: newGroupDescription || undefined,
        color: newGroupColor,
      }
      await createGroupMutation.mutateAsync(request)
      setShowAddGroupModal(false)
      setNewGroupKey('')
      setNewGroupName('')
      setNewGroupDescription('')
      setNewGroupColor('#5865F2')
    } catch {
      // Error handled by mutation state
    }
  }

  const handleCreateRole = async () => {
    if (!selectedDiscordRole || !newRoleKey || !selectedGroup) return

    try {
      const request: CreateRoleRequest = {
        roleId: selectedDiscordRole,
        roleKey: newRoleKey,
        groupId: selectedGroup.id,
        description: newRoleDescription || undefined,
      }
      await createRoleMutation.mutateAsync(request)
      setShowAddRoleModal(false)
      setSelectedDiscordRole('')
      setNewRoleKey('')
      setNewRoleDescription('')
    } catch {
      // Error handled by mutation state
    }
  }

  const handleMoveRole = async (role: DiscordRoleEntry, newGroupId: number | null) => {
    try {
      await updateRoleMutation.mutateAsync({
        roleId: role.roleId,
        request: { groupId: newGroupId || undefined },
      })
    } catch {
      // Error handled by mutation state
    }
  }

  const handleReset = async () => {
    try {
      await resetMutation.mutateAsync()
      setShowResetConfirm(false)
      setSelectedGroup(null)
    } catch {
      // Error handled by mutation state
    }
  }

  const confirmDeleteGroup = async () => {
    if (!deleteGroupConfirm) return

    try {
      await deleteGroupMutation.mutateAsync(deleteGroupConfirm.id)
      if (selectedGroup?.id === deleteGroupConfirm.id) {
        setSelectedGroup(null)
      }
      setDeleteGroupConfirm(null)
    } catch {
      // Error handled by mutation state
    }
  }

  const confirmDeleteRole = async () => {
    if (!deleteRoleConfirm) return

    try {
      await deleteRoleMutation.mutateAsync(deleteRoleConfirm.roleId)
      setDeleteRoleConfirm(null)
    } catch {
      // Error handled by mutation state
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold text-white">Discord Roles</h1>
            <p className="text-gray-400 text-sm">
              Manage Discord role configurations and groupings
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
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-orange-400 bg-discord-darker hover:bg-discord-lighter rounded-md transition-colors"
            title="Reset to config defaults"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-discord-light rounded-lg p-4 border border-discord-lighter">
        <div className="flex items-start gap-3">
          <div className="bg-discord-blurple/20 p-2 rounded-lg">
            <Users className="w-5 h-5 text-discord-blurple" />
          </div>
          <div>
            <h3 className="text-white font-medium mb-1">About Discord Roles</h3>
            <p className="text-gray-400 text-sm">
              This page manages Discord role configurations for the bot. Roles are organized into
              groups that serve both functional purposes (like determining admin or staff access)
              and visual organization in this dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Groups Sidebar */}
        <div className="col-span-4 bg-discord-light rounded-lg border border-discord-lighter">
          <div className="p-4 border-b border-discord-lighter flex items-center justify-between">
            <h2 className="text-white font-semibold">Groups</h2>
            <button
              onClick={() => setShowAddGroupModal(true)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-discord-lighter rounded transition-colors"
              title="Add new group"
            >
              <FolderPlus className="w-5 h-5" />
            </button>
          </div>

          <div className="divide-y divide-discord-lighter">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple mx-auto"></div>
              </div>
            ) : groups.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No groups configured
              </div>
            ) : (
              groups.map(group => (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group)}
                  className={`p-3 cursor-pointer transition-colors flex items-center justify-between group ${
                    selectedGroup?.id === group.id
                      ? 'bg-discord-blurple/20 border-l-2 border-discord-blurple'
                      : 'hover:bg-discord-lighter border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.color || '#5865F2' }}
                    />
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{group.displayName}</div>
                      <div className="text-xs text-gray-400">
                        {group.roleCount} role{group.roleCount !== 1 ? 's' : ''}
                        {group.isSystemGroup && ' • System'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!group.isSystemGroup && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteGroupConfirm(group)
                        }}
                        className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Roles Panel */}
        <div className="col-span-8 bg-discord-light rounded-lg border border-discord-lighter">
          <div className="p-4 border-b border-discord-lighter flex items-center justify-between">
            <h2 className="text-white font-semibold">
              {selectedGroup ? `Roles in: ${selectedGroup.displayName}` : 'Select a group'}
            </h2>
            {selectedGroup && (
              <button
                onClick={() => setShowAddRoleModal(true)}
                className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Role
              </button>
            )}
          </div>

          <div className="divide-y divide-discord-lighter">
            {!selectedGroup ? (
              <div className="p-12 text-center text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Select a group from the left to view its roles</p>
              </div>
            ) : rolesInSelectedGroup.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <p>No roles in this group</p>
                <p className="text-sm mt-1">Click &quot;Add Role&quot; to add Discord roles to this group</p>
              </div>
            ) : (
              rolesInSelectedGroup.map(role => (
                <div
                  key={role.id}
                  className="p-4 hover:bg-discord-lighter transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: role.color || '#99AAB5' }}
                    />
                    <div>
                      <div className="text-white font-medium">
                        {role.roleName || role.roleKey}
                      </div>
                      <div className="text-xs text-gray-400">
                        Key: {role.roleKey}
                        {role.isSystemRole && ' • System Role'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Move to group dropdown */}
                    <select
                      value={role.groupId || ''}
                      onChange={(e) => handleMoveRole(role, e.target.value ? parseInt(e.target.value) : null)}
                      className="bg-discord-darker text-gray-300 text-sm rounded-md border border-discord-lighter px-2 py-1 focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                    >
                      <option value="">Ungrouped</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.displayName}</option>
                      ))}
                    </select>

                    {!role.isSystemRole && (
                      <button
                        onClick={() => setDeleteRoleConfirm(role)}
                        className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Group Modal */}
      {showAddGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Group</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Group Key</label>
                <input
                  type="text"
                  value={newGroupKey}
                  onChange={(e) => setNewGroupKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="e.g., custom_roles"
                  className="w-full bg-discord-darker text-white rounded-md px-3 py-2 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                />
                <p className="text-xs text-gray-400 mt-1">Unique identifier, lowercase with underscores</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g., Custom Roles"
                  className="w-full bg-discord-darker text-white rounded-md px-3 py-2 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <textarea
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full bg-discord-darker text-white rounded-md px-3 py-2 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple resize-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Color</label>
                <input
                  type="color"
                  value={newGroupColor}
                  onChange={(e) => setNewGroupColor(e.target.value)}
                  className="w-full h-10 bg-discord-darker rounded-md border border-discord-lighter cursor-pointer"
                />
              </div>
            </div>

            {createGroupMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mt-4">
                <p className="text-sm text-red-400">
                  {(createGroupMutation.error as Error).message || 'Failed to create group'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddGroupModal(false)
                  setNewGroupKey('')
                  setNewGroupName('')
                  setNewGroupDescription('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={createGroupMutation.isPending || !newGroupKey || !newGroupName}
                className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Role Modal */}
      {showAddRoleModal && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Add Role to {selectedGroup.displayName}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Discord Role</label>
                <select
                  value={selectedDiscordRole}
                  onChange={(e) => {
                    setSelectedDiscordRole(e.target.value)
                    // Auto-fill role key based on role name
                    const role = availableRoles?.roles.find(r => r.id === e.target.value)
                    if (role && !newRoleKey) {
                      setNewRoleKey(role.name.toUpperCase().replace(/\s+/g, '_'))
                    }
                  }}
                  className="w-full bg-discord-darker text-white rounded-md px-3 py-2 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                >
                  <option value="">Select a Discord role...</option>
                  {availableRoles?.roles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {availableRoles?.roles.length === 0 && (
                  <p className="text-xs text-yellow-400 mt-1">All Discord roles are already tracked</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Role Key</label>
                <input
                  type="text"
                  value={newRoleKey}
                  onChange={(e) => setNewRoleKey(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                  placeholder="e.g., CUSTOM_ROLE"
                  className="w-full bg-discord-darker text-white rounded-md px-3 py-2 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                />
                <p className="text-xs text-gray-400 mt-1">Unique identifier for code references</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <textarea
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full bg-discord-darker text-white rounded-md px-3 py-2 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple resize-none"
                  rows={2}
                />
              </div>
            </div>

            {createRoleMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mt-4">
                <p className="text-sm text-red-400">
                  {(createRoleMutation.error as Error).message || 'Failed to add role'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddRoleModal(false)
                  setSelectedDiscordRole('')
                  setNewRoleKey('')
                  setNewRoleDescription('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={createRoleMutation.isPending || !selectedDiscordRole || !newRoleKey}
                className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createRoleMutation.isPending ? 'Adding...' : 'Add Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Group Confirmation Modal */}
      {deleteGroupConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Group?</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to delete <span className="text-white font-medium">{deleteGroupConfirm.displayName}</span>?
              Roles in this group will become ungrouped.
            </p>

            {deleteGroupMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(deleteGroupMutation.error as Error).message || 'Failed to delete group'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteGroupConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteGroup}
                disabled={deleteGroupMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteGroupMutation.isPending ? 'Deleting...' : 'Delete Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Role Confirmation Modal */}
      {deleteRoleConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Role?</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to delete <span className="text-white font-medium">{deleteRoleConfirm.roleName || deleteRoleConfirm.roleKey}</span>?
              This cannot be undone.
            </p>

            {deleteRoleMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">
                  {(deleteRoleMutation.error as Error).message || 'Failed to delete role'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteRoleConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteRole}
                disabled={deleteRoleMutation.isPending}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteRoleMutation.isPending ? 'Deleting...' : 'Delete Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Reset Discord Roles?</h3>
            <p className="text-gray-400 mb-4">
              This will remove all current Discord Role configurations and re-seed from the
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
