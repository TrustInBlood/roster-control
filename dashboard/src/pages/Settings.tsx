import { Settings as SettingsIcon, Eye, EyeOff, ChevronDown, ChevronRight, RefreshCw, Shield, UserCheck, Users } from 'lucide-react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useAuth } from '../hooks/useAuth'
import type { SectionKey } from '../types/preferences'

interface SectionConfigProps {
  sectionKey: SectionKey
  label: string
  description: string
  icon: React.ElementType
  iconColor: string
}

function SectionConfig({ sectionKey, label, description, icon: Icon, iconColor }: SectionConfigProps) {
  const { getSectionPreferences, updateSectionPreference } = useUserPreferences()
  const pref = getSectionPreferences(sectionKey)

  return (
    <div className="bg-discord-darker rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${iconColor}`} />
          <div>
            <h3 className="text-white font-medium">{label}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 cursor-pointer hover:bg-discord-light/30 p-2 -m-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={!pref.hidden}
            onChange={(e) => updateSectionPreference(sectionKey, { hidden: !e.target.checked })}
            className="rounded border-gray-500 bg-discord-light text-discord-blurple focus:ring-discord-blurple focus:ring-offset-0"
          />
          <span className="text-sm text-gray-300 flex items-center gap-1.5">
            {pref.hidden ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            Visible
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer hover:bg-discord-light/30 p-2 -m-2 rounded transition-colors">
          <input
            type="checkbox"
            checked={pref.defaultExpanded}
            onChange={(e) => updateSectionPreference(sectionKey, { defaultExpanded: e.target.checked })}
            className="rounded border-gray-500 bg-discord-light text-discord-blurple focus:ring-discord-blurple focus:ring-offset-0"
          />
          <span className="text-sm text-gray-300 flex items-center gap-1.5">
            {pref.defaultExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Expand by default
          </span>
        </label>
      </div>
    </div>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const { isSyncing } = useUserPreferences()

  const sections: SectionConfigProps[] = [
    {
      sectionKey: 'staff',
      label: 'Staff Online',
      description: 'Admin and staff members currently on servers',
      icon: Shield,
      iconColor: 'text-discord-blurple',
    },
    {
      sectionKey: 'members',
      label: 'Members',
      description: 'Registered members currently on servers',
      icon: UserCheck,
      iconColor: 'text-green-400',
    },
    {
      sectionKey: 'public',
      label: 'Public Players',
      description: 'Unregistered public players on servers',
      icon: Users,
      iconColor: 'text-gray-400',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <SettingsIcon className="w-7 h-7 text-discord-blurple" />
            Settings
          </h1>
          <p className="text-gray-400 mt-1">Customize your dashboard experience</p>
        </div>

        {isSyncing && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Syncing...
          </div>
        )}
      </div>

      {/* User info */}
      {user && (
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-3">
            {user.avatar && (
              <img
                src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=80`}
                alt={user.displayName}
                className="w-10 h-10 rounded-full"
              />
            )}
            <div>
              <p className="text-white font-medium">{user.displayName}</p>
              <p className="text-xs text-gray-400">
                Preferences sync across all your devices
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Section Preferences */}
      <div className="bg-discord-light rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Dashboard Sections</h2>
        <p className="text-sm text-gray-400 mb-4">
          Configure which player sections to show on the server status dashboard and their default state.
        </p>

        <div className="space-y-3">
          {sections.map((section) => (
            <SectionConfig key={section.sectionKey} {...section} />
          ))}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-discord-blurple/10 border border-discord-blurple/30 rounded-lg p-4">
        <p className="text-sm text-gray-300">
          Changes are saved automatically and synced to the server.
          Your preferences will be available when you log in from any device.
        </p>
      </div>
    </div>
  )
}
