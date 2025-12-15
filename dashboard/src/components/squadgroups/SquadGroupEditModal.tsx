import { useState, useEffect } from 'react'
import { X, Check, CheckSquare, Square } from 'lucide-react'
import { useUpdateSquadRole } from '../../hooks/useSquadGroups'
import type { RoleConfig, SquadPermission } from '../../types/squadgroups'

interface SquadGroupEditModalProps {
  roleConfig: RoleConfig
  squadPermissions: SquadPermission[]
  onClose: () => void
}

export default function SquadGroupEditModal({
  roleConfig,
  squadPermissions,
  onClose,
}: SquadGroupEditModalProps) {
  const updateMutation = useUpdateSquadRole()

  const [groupName, setGroupName] = useState(roleConfig.groupName || '')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(roleConfig.permissions)

  // Reset form when roleConfig changes
  useEffect(() => {
    setGroupName(roleConfig.groupName || '')
    setSelectedPermissions(roleConfig.permissions)
  }, [roleConfig])

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

    try {
      await updateMutation.mutateAsync({
        roleId: roleConfig.roleId,
        request: {
          groupName: groupName || roleConfig.roleName || undefined,
          permissions: selectedPermissions,
        },
      })
      onClose()
    } catch {
      // Error handled by mutation state
    }
  }

  const hasChanges =
    groupName !== roleConfig.groupName ||
    JSON.stringify(selectedPermissions.sort()) !== JSON.stringify(roleConfig.permissions.sort())

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-discord-lighter">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: roleConfig.color || '#99AAB5' }}
            />
            <h3 className="text-lg font-semibold text-white">
              Edit {roleConfig.roleName || 'Role'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Group Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Squad Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={roleConfig.roleName || 'Enter group name'}
              className="w-full bg-discord-darker border border-discord-lighter rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
            />
            <p className="text-xs text-gray-500 mt-1">
              This is the group name used in the Squad whitelist file (e.g., HeadAdmin, Moderator)
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
          </div>

          {/* Error */}
          {updateMutation.error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-md p-3">
              <p className="text-sm text-red-400">
                {(updateMutation.error as Error).message || 'Failed to update role'}
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
            disabled={updateMutation.isPending || !hasChanges}
            className="flex items-center gap-2 bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              'Saving...'
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
