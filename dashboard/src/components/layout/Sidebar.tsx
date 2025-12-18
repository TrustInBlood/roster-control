import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Users, Clock, Shield, UserX, Key, Layers, Image } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import type { Permission } from '../../types/auth'

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  disabled?: boolean
  permission?: Permission
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Whitelist', href: '/whitelist', icon: List, permission: 'VIEW_WHITELIST' },
  { name: 'Members', href: '/members', icon: Users, permission: 'VIEW_MEMBERS' },
  { name: 'Duty Stats', href: '/duty', icon: Clock, disabled: true, permission: 'VIEW_DUTY' },
  { name: 'Audit Logs', href: '/audit', icon: Shield, permission: 'VIEW_AUDIT' },
  { name: 'Unlinked Staff', href: '/security/unlinked-staff', icon: UserX, permission: 'VIEW_SECURITY' },
  { name: 'Permissions', href: '/admin/permissions', icon: Key, permission: 'MANAGE_PERMISSIONS' },
  { name: 'Squad Groups', href: '/admin/squadgroups', icon: Layers, permission: 'MANAGE_PERMISSIONS' },
  { name: 'Stats Templates', href: '/admin/stats-templates', icon: Image, permission: 'VIEW_STATS_TEMPLATES' },
]

export default function Sidebar() {
  const { hasPermission } = useAuth()

  // Filter navigation items based on permissions
  const visibleNavigation = navigation.filter(item => {
    if (item.permission) {
      return hasPermission(item.permission)
    }
    return true
  })

  return (
    <div className="w-64 bg-discord-darker flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-discord-light">
        <h1 className="text-xl font-bold text-white">Roster Control</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.disabled ? '#' : item.href}
            onClick={(e) => item.disabled && e.preventDefault()}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                item.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : isActive
                  ? 'bg-discord-blurple text-white'
                  : 'text-gray-300 hover:bg-discord-light hover:text-white'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {item.name}
            {item.disabled && (
              <span className="ml-auto text-xs bg-discord-light px-2 py-0.5 rounded">Soon</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-discord-light">
        <p className="text-xs text-gray-500 text-center">
          Roster Control v1.0
        </p>
      </div>
    </div>
  )
}
