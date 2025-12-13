import { useState, useEffect, useMemo } from 'react'
import { X, AlertTriangle, Search, Check } from 'lucide-react'
import { useUpdatePermission, useDiscordRoles } from '../../hooks/usePermissions'
import type { Permission, DiscordRole } from '../../types/permissions'

interface PermissionEditModalProps {
  permission: Permission
  onClose: () => void
}

// Format permission name to readable text
function formatPermissionName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export default function PermissionEditModal({ permission, onClose }: PermissionEditModalProps) {
  const updateMutation = useUpdatePermission()
  const { data: rolesData, isLoading: rolesLoading } = useDiscordRoles()

  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    new Set(permission.roles.map(r => r.id))
  )
  const [searchQuery, setSearchQuery] = useState('')

  // Reset selected roles when permission changes
  useEffect(() => {
    setSelectedRoleIds(new Set(permission.roles.map(r => r.id)))
  }, [permission])

  // Filter roles based on search
  const filteredRoles = useMemo(() => {
    if (!rolesData?.roles) return []
    const query = searchQuery.toLowerCase()
    return rolesData.roles.filter(role =>
      role.name.toLowerCase().includes(query)
    )
  }, [rolesData?.roles, searchQuery])

  const handleRoleToggle = (roleId: string) => {
    const newSelected = new Set(selectedRoleIds)
    if (newSelected.has(roleId)) {
      newSelected.delete(roleId)
    } else {
      newSelected.add(roleId)
    }
    setSelectedRoleIds(newSelected)
  }

  const handleSelectAll = () => {
    if (!rolesData?.roles) return
    setSelectedRoleIds(new Set(filteredRoles.map(r => r.id)))
  }

  const handleClearAll = () => {
    setSelectedRoleIds(new Set())
  }

  const handleSubmit = async () => {
    // Critical permission protection
    if (permission.critical && selectedRoleIds.size === 0) {
      return
    }

    try {
      await updateMutation.mutateAsync({
        permissionName: permission.name,
        roleIds: Array.from(selectedRoleIds),
      })
      onClose()
    } catch {
      // Error is handled by mutation state
    }
  }

  const hasChanges = () => {
    const currentRoleIds = new Set(permission.roles.map(r => r.id))
    if (currentRoleIds.size !== selectedRoleIds.size) return true
    for (const id of currentRoleIds) {
      if (!selectedRoleIds.has(id)) return true
    }
    return false
  }

  const canSave = () => {
    if (!hasChanges()) return false
    if (permission.critical && selectedRoleIds.size === 0) return false
    return true
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-light rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-discord-lighter shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Edit {formatPermissionName(permission.name)}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{permission.description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Critical Warning */}
        {permission.critical && (
          <div className="mx-4 mt-4 p-3 bg-amber-500/20 border border-amber-500/30 rounded-md flex items-start gap-2 shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-400 font-medium">Critical Permission</p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                This permission cannot be left without any assigned roles. At least one role must be selected.
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search roles..."
              className="w-full bg-discord-darker border border-discord-lighter rounded-md pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple"
            />
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-discord-blurple hover:underline"
            >
              Select filtered
            </button>
            <span className="text-gray-500">|</span>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={permission.critical && selectedRoleIds.size <= 1}
              className="text-xs text-discord-blurple hover:underline disabled:text-gray-500 disabled:no-underline"
            >
              Clear all
            </button>
            <span className="text-gray-500 ml-auto text-xs">
              {selectedRoleIds.size} selected
            </span>
          </div>

          {/* Role List */}
          {rolesLoading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-discord-blurple mx-auto"></div>
              <p className="text-gray-400 text-sm mt-2">Loading roles...</p>
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              {searchQuery ? 'No roles match your search' : 'No roles available'}
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filteredRoles.map((role) => (
                <RoleItem
                  key={role.id}
                  role={role}
                  isSelected={selectedRoleIds.has(role.id)}
                  onToggle={() => handleRoleToggle(role.id)}
                  disabled={
                    permission.critical &&
                    selectedRoleIds.size === 1 &&
                    selectedRoleIds.has(role.id)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Error Message */}
        {updateMutation.error && (
          <div className="mx-4 mb-4 bg-red-500/20 border border-red-500/30 rounded-md p-3 shrink-0">
            <p className="text-sm text-red-400">
              {(updateMutation.error as Error).message || 'Failed to update permission'}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-discord-lighter shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave() || updateMutation.isPending}
            className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Role item component
interface RoleItemProps {
  role: DiscordRole
  isSelected: boolean
  onToggle: () => void
  disabled?: boolean
}

function RoleItem({ role, isSelected, onToggle, disabled }: RoleItemProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left ${
        isSelected
          ? 'bg-discord-blurple/20 border border-discord-blurple/50'
          : 'bg-discord-darker border border-discord-lighter hover:border-discord-blurple/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {/* Checkbox */}
      <div
        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
          isSelected
            ? 'bg-discord-blurple border-discord-blurple'
            : 'border-gray-500'
        }`}
      >
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>

      {/* Role Color Indicator */}
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: role.color !== '#000000' ? role.color : '#99aab5' }}
      />

      {/* Role Name */}
      <span className="text-sm text-white truncate">{role.name}</span>
    </button>
  )
}
