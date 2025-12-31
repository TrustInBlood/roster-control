import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Wifi, WifiOff, Server } from 'lucide-react'
import { useServerStatus } from '../hooks/useServerStatus'
import ServerCard from '../components/ServerCard'
import { formatDistanceToNow } from 'date-fns'

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showPermissionError, setShowPermissionError] = useState(false)
  // Track which sections are expanded - persists across polling updates
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const { servers, isLoading, error, socketConnected, lastUpdate, refresh } = useServerStatus()

  // Toggle a section's expanded state
  const handleToggleSection = useCallback((serverId: string, section: string) => {
    const key = `${serverId}-${section}`
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }, [])

  // Check for permission denied error in URL
  useEffect(() => {
    if (searchParams.get('error') === 'permission_denied') {
      setShowPermissionError(true)
      // Clear the error from URL
      searchParams.delete('error')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Calculate total players across all servers
  const totalPlayers = servers.reduce((sum, s) => sum + s.playerCount, 0)
  const totalMaxPlayers = servers.reduce((sum, s) => sum + s.maxPlayers, 0)
  const connectedServers = servers.filter(s => s.connected).length

  return (
    <div className="space-y-6">
      {/* Permission Denied Alert */}
      {showPermissionError && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-red-400 font-medium">Permission Denied</h3>
            <p className="text-gray-300 text-sm mt-1">
              You no longer have permission to access that resource. Your roles may have changed.
            </p>
          </div>
          <button
            onClick={() => setShowPermissionError(false)}
            className="text-gray-400 hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Server Status</h1>
          <p className="text-gray-400 mt-1">Real-time overview of all Squad servers</p>
        </div>

        {/* Connection Status & Refresh */}
        <div className="flex items-center gap-3">
          {/* Socket Status */}
          <div className="flex items-center gap-1.5 text-sm">
            {socketConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-green-400">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-yellow-400" />
                <span className="text-yellow-400">Polling</span>
              </>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 rounded-md bg-discord-light hover:bg-discord-lighter transition-colors disabled:opacity-50"
            title="Refresh server status"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="bg-discord-blurple/20 p-2 rounded-lg">
              <Server className="w-5 h-5 text-discord-blurple" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Servers</p>
              <p className="text-xl font-bold text-white">
                {connectedServers}
                <span className="text-gray-500 text-sm font-normal">/{servers.length}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/20 p-2 rounded-lg">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total Players</p>
              <p className="text-xl font-bold text-white">
                {totalPlayers}
                <span className="text-gray-500 text-sm font-normal">/{totalMaxPlayers}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="bg-purple-500/20 p-2 rounded-lg">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-400">Staff Online</p>
              <p className="text-xl font-bold text-white">
                {servers.reduce((sum, s) => sum + (s.onlineStaff?.length ?? 0), 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Last Update */}
      {lastUpdate && (
        <p className="text-xs text-gray-500">
          Last updated {formatDistanceToNow(new Date(lastUpdate), { addSuffix: true })}
        </p>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-400">Failed to load server status. Please try again.</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && servers.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      )}

      {/* Server Grid */}
      {servers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              expandedSections={expandedSections}
              onToggleSection={handleToggleSection}
            />
          ))}
        </div>
      )}

      {/* No Servers */}
      {!isLoading && servers.length === 0 && !error && (
        <div className="bg-discord-light rounded-lg p-8 text-center">
          <Server className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-white mb-1">No Servers Connected</h3>
          <p className="text-gray-400 text-sm">
            No SquadJS server connections are configured or available.
          </p>
        </div>
      )}
    </div>
  )
}
