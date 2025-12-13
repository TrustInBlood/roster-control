import { Shield, AlertTriangle } from 'lucide-react'
import type { Permission } from '../../types/permissions'

interface PermissionsTableProps {
  permissions: Permission[]
  isLoading: boolean
  onRowClick: (permission: Permission) => void
}

// Format permission name to readable text
function formatPermissionName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export default function PermissionsTable({
  permissions,
  isLoading,
  onRowClick,
}: PermissionsTableProps) {
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple mx-auto"></div>
        <p className="text-gray-400 mt-4">Loading permissions...</p>
      </div>
    )
  }

  if (permissions.length === 0) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-12 h-12 mx-auto text-gray-500 mb-4" />
        <p className="text-gray-400">No permissions found</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-discord-lighter">
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Permission
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Description
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              Assigned Roles
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-discord-lighter">
          {permissions.map((permission) => (
            <tr
              key={permission.name}
              className="hover:bg-discord-lighter/50 transition-colors cursor-pointer"
              onClick={() => onRowClick(permission)}
            >
              {/* Permission Name */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    {formatPermissionName(permission.name)}
                  </span>
                  {permission.critical && (
                    <span className="flex items-center gap-1 bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" />
                      Critical
                    </span>
                  )}
                </div>
              </td>

              {/* Description */}
              <td className="px-4 py-3 text-gray-400 text-sm">
                {permission.description}
              </td>

              {/* Assigned Roles */}
              <td className="px-4 py-3">
                {permission.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {permission.roles.slice(0, 5).map((role) => (
                      <span
                        key={role.id}
                        className="bg-discord-darker text-gray-300 text-xs px-2 py-1 rounded"
                        title={role.name || role.id}
                      >
                        {role.name || role.id}
                      </span>
                    ))}
                    {permission.roles.length > 5 && (
                      <span className="bg-discord-darker text-gray-400 text-xs px-2 py-1 rounded">
                        +{permission.roles.length - 5} more
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-red-400 text-sm">No roles assigned</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
