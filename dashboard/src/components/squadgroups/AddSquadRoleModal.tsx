import { useState } from 'react'
import { X, Plus, Search, CheckSquare, Square } from 'lucide-react'
import { useSquadGroupRoles, useAddSquadRole } from '../../hooks/useSquadGroups'
import type { SquadPermission, DiscordRoleForSquad } from '../../types/squadgroups'

interface AddSquadRoleModalProps {
  squadPermissions: SquadPermission[]
  onClose: () => void
}

export default function AddSquadRoleModal({
  squadPermissions,
  onClose,
}: AddSquadRoleModalProps) {
  const { data: rolesData, isLoading: isLoadingRoles } = useSquadGroupRoles()
  const addMutation = useAddSquadRole()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState<DiscordRoleForSquad | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

  // Filter roles that aren't already configured and match search
  const availableRoles = rolesData?.roles.filter(
    (role) =>
      !role.isConfigured &&
      role.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  // Auto-derive group name from role name (sanitized)
  const sanitizeGroupName = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, '')
  const groupName = selectedRole ? sanitizeGroupName(selectedRole.name) || `Role_${selectedRole.id}` : ''

  const handleRoleSelect = (role: DiscordRoleForSquad) => {
    setSelectedRole(role)
    // Default to all permissions for new roles
    setSelectedPermissions(squadPermissions.map(p => p.id))
  }

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permissionId)
        ? prev.filter(p => p !== permissionId)
        : [...prev, permissionId]
    )
  }

  const handleSelectAll = () => {
    setSelectedPermissions(squadPermissions.map(p => p.id))
  }

  const handleClearAll = () => {
    setSelectedPermissions([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedRole || selectedPermissions.length === 0) return

    try {
      await addMutation.mutateAsync({
        roleId: selectedRole.id,
        permissions: selectedPermissions,
      })
      onClose()
    } catch {
      // Error handled by mutation state
    }
  }

  const canSubmit = selectedRole && selectedPermissions.length > 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-discord-lighter">
          <h3 className="text-lg font-semibold text-white">Add Role to Squad Groups</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Role Selection */}
          {!selectedRole ? (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select a Discord Role
              </label>

              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search roles..."
                  className="w-full bg-discord-darker border border-discord-lighter rounded-md pl-10 pr-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
                />
              </div>

              {/* Role List */}
              <div className="bg-discord-darker rounded-md max-h-60 overflow-y-auto">
                {isLoadingRoles ? (
                  <div className="p-4 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-discord-blurple mx-auto"></div>
                  </div>
                ) : availableRoles.length === 0 ? (
                  <div className="p-4 text-center text-gray-400">
                    {searchQuery ? 'No matching roles found' : 'No available roles'}
                  </div>
                ) : (
                  availableRoles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => handleRoleSelect(role)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-discord-lighter/50 transition-colors text-left"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: role.color || '#99AAB5' }}
                      />
                      <span className="text-white flex-1">{role.name}</span>
                      <span className="text-gray-500 text-xs">#{role.position}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Selected Role Display */}
              <div className="flex items-center justify-between bg-discord-darker rounded-md p-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: selectedRole.color || '#99AAB5' }}
                  />
                  <span className="text-white font-medium">{selectedRole.name}</span>
                  <span className="text-gray-500 text-xs">#{selectedRole.position}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole(null)
                    setSelectedPermissions([])
                  }}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  Change
                </button>
              </div>

              {/* Group Name (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Squad Group Name
                </label>
                <div className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-gray-300">
                  {groupName}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Auto-derived from role name (used in Squad whitelist file)
                </p>
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300">
                    Squad Permissions
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-xs text-discord-blurple hover:text-discord-blurple/80"
                    >
                      Select All
                    </button>
                    <span className="text-gray-500">|</span>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-xs text-gray-400 hover:text-gray-300"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="space-y-2 bg-discord-darker rounded-md p-3">
                  {squadPermissions.map((permission) => (
                    <label
                      key={permission.id}
                      className="flex items-start gap-3 cursor-pointer hover:bg-discord-lighter/30 rounded p-2 -m-1"
                    >
                      <button
                        type="button"
                        onClick={() => handlePermissionToggle(permission.id)}
                        className={`mt-0.5 flex-shrink-0 ${
                          selectedPermissions.includes(permission.id)
                            ? 'text-discord-blurple'
                            : 'text-gray-500'
                        }`}
                      >
                        {selectedPermissions.includes(permission.id) ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      <div className="flex-1">
                        <span className="text-white text-sm font-medium">
                          {permission.label}
                        </span>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {permission.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                {selectedPermissions.length === 0 && (
                  <p className="text-red-400 text-xs mt-2">
                    Select at least one permission
                  </p>
                )}
              </div>
            </>
          )}

          {/* Error */}
          {addMutation.error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3">
              <p className="text-sm text-red-400">
                {(addMutation.error as Error).message || 'Failed to add role'}
              </p>
            </div>
          )}
        </form>

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
            disabled={addMutation.isPending || !canSubmit}
            className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {addMutation.isPending ? (
              'Adding...'
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Role
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
