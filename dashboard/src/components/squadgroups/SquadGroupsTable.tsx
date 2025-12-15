import { Shield, Trash2 } from 'lucide-react'
import type { RoleConfig, SquadPermission } from '../../types/squadgroups'

interface SquadGroupsTableProps {
  roleConfigs: RoleConfig[]
  squadPermissions: SquadPermission[]
  isLoading: boolean
  onRowClick: (roleConfig: RoleConfig) => void
  onDelete: (roleConfig: RoleConfig) => void
}

export default function SquadGroupsTable({
  roleConfigs,
  squadPermissions,
  isLoading,
  onRowClick,
  onDelete,
}: SquadGroupsTableProps) {
  // Create a lookup map for permission labels
  const permissionLabels = squadPermissions.reduce((acc, p) => {
    acc[p.id] = p.label
    return acc
  }, {} as Record<string, string>)

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple mx-auto"></div>
        <p className="text-gray-400 mt-4">Loading squad groups...</p>
      </div>
    )
  }

  if (roleConfigs.length === 0) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-12 h-12 mx-auto text-gray-500 mb-4" />
        <p className="text-gray-400">No squad groups configured</p>
        <p className="text-gray-500 text-sm mt-2">Click "Add Role" to configure a Discord role with Squad permissions</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-discord-lighter">
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Discord Role
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Position
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Squad Group
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Permissions
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-discord-lighter">
          {roleConfigs.map((config) => (
            <tr
              key={config.roleId}
              className="hover:bg-discord-lighter/50 transition-colors cursor-pointer"
              onClick={() => onRowClick(config)}
            >
              {/* Discord Role */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: config.color || '#99AAB5' }}
                  />
                  <span className="text-white font-medium">
                    {config.roleName || 'Unknown Role'}
                  </span>
                </div>
              </td>

              {/* Position */}
              <td className="px-4 py-3 text-gray-400 text-sm">
                #{config.discordPosition}
              </td>

              {/* Squad Group Name */}
              <td className="px-4 py-3">
                <span className="text-gray-300 font-mono text-sm bg-discord-darker px-2 py-1 rounded">
                  {config.groupName}
                </span>
              </td>

              {/* Permissions */}
              <td className="px-4 py-3">
                {config.permissions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {config.permissions.slice(0, 3).map((perm) => (
                      <span
                        key={perm}
                        className="bg-discord-blurple/20 text-discord-blurple text-xs px-2 py-1 rounded"
                        title={permissionLabels[perm] || perm}
                      >
                        {permissionLabels[perm] || perm}
                      </span>
                    ))}
                    {config.permissions.length > 3 && (
                      <span className="bg-discord-darker text-gray-400 text-xs px-2 py-1 rounded">
                        +{config.permissions.length - 3} more
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-red-400 text-sm">No permissions</span>
                )}
              </td>

              {/* Actions */}
              <td className="px-4 py-3 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(config)
                  }}
                  className="text-gray-400 hover:text-red-400 transition-colors p-1"
                  title="Remove from Squad Groups"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
