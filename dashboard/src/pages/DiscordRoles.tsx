import { useState } from 'react'
import { Users, Plus, RefreshCw, RotateCcw, FolderPlus, ChevronRight, Trash2, Check, Search } from 'lucide-react'
import {
  useDiscordRoles,
  useCreateDiscordRoleGroup,
  useDeleteDiscordRoleGroup,
  useUpdateDiscordRole,
  useDeleteDiscordRole,
  useResetDiscordRoles,
} from '../hooks/useDiscordRoles'
import type { DiscordRoleGroup, DiscordRoleEntry, CreateGroupRequest } from '../types/discordroles'

export default function DiscordRoles() {
  const { data, isLoading, refetch, isRefetching } = useDiscordRoles()
  const createGroupMutation = useCreateDiscordRoleGroup()
  const deleteGroupMutation = useDeleteDiscordRoleGroup()
  const updateRoleMutation = useUpdateDiscordRole()
  const deleteRoleMutation = useDeleteDiscordRole()
  const resetMutation = useResetDiscordRoles()

  const [selectedGroup, setSelectedGroup] = useState<DiscordRoleGroup | null>(null)
  const [showAddGroupModal, setShowAddGroupModal] = useState(false)
  const [showAddRoleModal, setShowAddRoleModal] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<DiscordRoleGroup | null>(null)
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState<DiscordRoleEntry | null>(null)
  const [editGroupsRole, setEditGroupsRole] = useState<DiscordRoleEntry | null>(null)

  // Form states
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [newGroupColor, setNewGroupColor] = useState('#5865F2')

  // Multi-select for adding roles to a group
  const [selectedRolesToAdd, setSelectedRolesToAdd] = useState<number[]>([])
  const [addRolesSearch, setAddRolesSearch] = useState('')
  const [isAddingRoles, setIsAddingRoles] = useState(false)

  // Multi-select for editing role groups
  const [editRoleGroupIds, setEditRoleGroupIds] = useState<number[]>([])

  const roles = data?.roles || []
  const groups = data?.groups || []

  // Filter roles that belong to the selected group
  const rolesInSelectedGroup = selectedGroup
    ? roles.filter(r => r.groupIds.includes(selectedGroup.id))
    : []

  // Roles available to add to the selected group (not already in that group)
  const rolesAvailableToAdd = selectedGroup
    ? roles.filter(r =>
        !r.groupIds.includes(selectedGroup.id) &&
        (r.roleName || r.roleKey).toLowerCase().includes(addRolesSearch.toLowerCase())
      )
    : []

  // Generate a unique key from name
  const generateKey = (name: string) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    return `${base}_${Date.now().toString(36)}`
  }

  const handleCreateGroup = async () => {
    if (!newGroupName) return

    try {
      const request: CreateGroupRequest = {
        groupKey: generateKey(newGroupName),
        displayName: newGroupName,
        description: newGroupDescription || undefined,
        color: newGroupColor,
      }
      await createGroupMutation.mutateAsync(request)
      setShowAddGroupModal(false)
      setNewGroupName('')
      setNewGroupDescription('')
      setNewGroupColor('#5865F2')
    } catch {
      // Error handled by mutation state
    }
  }

  const handleAddRolesToGroup = async () => {
    if (selectedRolesToAdd.length === 0 || !selectedGroup) return

    setIsAddingRoles(true)
    try {
      // For each selected role, add the selected group to its groupIds
      for (const roleTableId of selectedRolesToAdd) {
        const role = roles.find(r => r.id === roleTableId)
        if (role) {
          const newGroupIds = [...role.groupIds, selectedGroup.id]
          await updateRoleMutation.mutateAsync({
            roleId: role.roleId,
            request: { groupIds: newGroupIds },
          })
        }
      }
      setShowAddRoleModal(false)
      setSelectedRolesToAdd([])
      setAddRolesSearch('')
    } catch {
      // Error handled by mutation state
    } finally {
      setIsAddingRoles(false)
    }
  }

  const toggleRoleToAdd = (roleTableId: number) => {
    setSelectedRolesToAdd(prev =>
      prev.includes(roleTableId)
        ? prev.filter(id => id !== roleTableId)
        : [...prev, roleTableId]
    )
  }

  const selectAllAvailableRoles = () => {
    setSelectedRolesToAdd(rolesAvailableToAdd.map(r => r.id))
  }

  const deselectAllRoles = () => {
    setSelectedRolesToAdd([])
  }

  const openEditGroupsModal = (role: DiscordRoleEntry) => {
    setEditGroupsRole(role)
    setEditRoleGroupIds([...role.groupIds])
  }

  const handleUpdateRoleGroups = async () => {
    if (!editGroupsRole) return

    try {
      await updateRoleMutation.mutateAsync({
        roleId: editGroupsRole.roleId,
        request: { groupIds: editRoleGroupIds },
      })
      setEditGroupsRole(null)
      setEditRoleGroupIds([])
    } catch {
      // Error handled by mutation state
    }
  }

  const toggleGroupForRole = (groupId: number) => {
    setEditRoleGroupIds(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
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
              This page manages Discord role configurations for the bot. Roles can belong to
              multiple groups for organization. Groups serve both functional purposes (like
              determining admin or staff access) and visual organization.
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
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteGroupConfirm(group)
                      }}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                Add Roles
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
                <p className="text-sm mt-1">Click &quot;Add Roles&quot; to add Discord roles to this group</p>
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
                      {role.groups.length > 1 && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {role.groups.map(g => (
                            <span
                              key={g.id}
                              className="text-xs bg-discord-darker px-1.5 py-0.5 rounded"
                              style={{ color: groups.find(gr => gr.id === g.id)?.color || '#99AAB5' }}
                            >
                              {g.displayName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditGroupsModal(role)}
                      className="text-xs bg-discord-darker text-gray-300 hover:text-white px-2 py-1 rounded transition-colors"
                    >
                      Edit Groups
                    </button>

                    <button
                      onClick={() => setDeleteRoleConfirm(role)}
                      className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                <label className="block text-sm font-medium text-gray-300 mb-1">Group Name</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g., Custom Roles"
                  className="w-full bg-discord-darker text-white rounded-md px-3 py-2 border border-discord-lighter focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description (optional)</label>
                <textarea
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  placeholder="What is this group for?"
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
                  setNewGroupName('')
                  setNewGroupDescription('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={createGroupMutation.isPending || !newGroupName}
                className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Roles Modal (Multi-select from tracked roles) */}
      {showAddRoleModal && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-lg mx-4 p-6 max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-4">
              Add Roles to {selectedGroup.displayName}
            </h3>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={addRolesSearch}
                onChange={(e) => setAddRolesSearch(e.target.value)}
                placeholder="Search roles..."
                className="w-full bg-discord-darker border border-discord-lighter rounded-md pl-10 pr-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
              />
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">
                {selectedRolesToAdd.length} role{selectedRolesToAdd.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAllAvailableRoles}
                  className="text-xs text-discord-blurple hover:text-discord-blurple/80 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAllRoles}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-discord-lighter rounded-md">
              {rolesAvailableToAdd.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <p>{addRolesSearch ? 'No matching roles found' : 'All roles are already in this group'}</p>
                </div>
              ) : (
                <div className="divide-y divide-discord-lighter">
                  {rolesAvailableToAdd.map(role => (
                    <label
                      key={role.id}
                      className="flex items-center gap-3 p-3 hover:bg-discord-lighter cursor-pointer transition-colors"
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedRolesToAdd.includes(role.id)
                            ? 'bg-discord-blurple border-discord-blurple'
                            : 'border-gray-500'
                        }`}
                      >
                        {selectedRolesToAdd.includes(role.id) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: role.color || '#99AAB5' }}
                      />
                      <span className="text-white flex-1">{role.roleName || role.roleKey}</span>
                      {role.groups.length > 0 && (
                        <span className="text-xs text-gray-500">
                          in {role.groups.length} group{role.groups.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <input
                        type="checkbox"
                        checked={selectedRolesToAdd.includes(role.id)}
                        onChange={() => toggleRoleToAdd(role.id)}
                        className="sr-only"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            {updateRoleMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mt-4">
                <p className="text-sm text-red-400">
                  {(updateRoleMutation.error as Error).message || 'Failed to add roles'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddRoleModal(false)
                  setSelectedRolesToAdd([])
                  setAddRolesSearch('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRolesToGroup}
                disabled={isAddingRoles || selectedRolesToAdd.length === 0}
                className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isAddingRoles ? 'Adding...' : `Add ${selectedRolesToAdd.length} Role${selectedRolesToAdd.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Groups Modal */}
      {editGroupsRole && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-light rounded-lg w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Edit Groups</h3>
            <p className="text-gray-400 text-sm mb-4">
              Select which groups <span className="text-white font-medium">{editGroupsRole.roleName || editGroupsRole.roleKey}</span> belongs to:
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {groups.map(group => (
                <label
                  key={group.id}
                  className="flex items-center gap-3 p-3 bg-discord-darker rounded-md hover:bg-discord-lighter cursor-pointer transition-colors"
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      editRoleGroupIds.includes(group.id)
                        ? 'bg-discord-blurple border-discord-blurple'
                        : 'border-gray-500'
                    }`}
                  >
                    {editRoleGroupIds.includes(group.id) && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: group.color || '#5865F2' }}
                  />
                  <span className="text-white">{group.displayName}</span>
                  <input
                    type="checkbox"
                    checked={editRoleGroupIds.includes(group.id)}
                    onChange={() => toggleGroupForRole(group.id)}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>

            {updateRoleMutation.error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3 mt-4">
                <p className="text-sm text-red-400">
                  {(updateRoleMutation.error as Error).message || 'Failed to update groups'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setEditGroupsRole(null)
                  setEditRoleGroupIds([])
                }}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRoleGroups}
                disabled={updateRoleMutation.isPending}
                className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              >
                {updateRoleMutation.isPending ? 'Saving...' : 'Save Changes'}
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
              Roles will be removed from this group but not deleted.
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
