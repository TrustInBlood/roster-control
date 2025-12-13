import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Users, AlertTriangle } from 'lucide-react'
import { useWhitelistStats } from '../hooks/useWhitelist'

export default function Dashboard() {
  const { data: stats, isLoading } = useWhitelistStats()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showPermissionError, setShowPermissionError] = useState(false)

  // Check for permission denied error in URL
  useEffect(() => {
    if (searchParams.get('error') === 'permission_denied') {
      setShowPermissionError(true)
      // Clear the error from URL
      searchParams.delete('error')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

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

      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Overview of your roster management system</p>
      </div>

      {/* Stats */}
      <Link
        to="/whitelist"
        className="bg-discord-light rounded-lg p-6 hover:bg-discord-lighter transition-colors block max-w-sm"
      >
        <div className="flex items-center gap-4">
          <div className="bg-green-500 p-3 rounded-lg">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-400">Whitelisted Players</p>
            <p className="text-2xl font-bold text-white">
              {isLoading ? (
                <span className="animate-pulse">...</span>
              ) : (
                stats?.active ?? '-'
              )}
            </p>
          </div>
        </div>
      </Link>

      {/* Source Breakdown */}
      {stats?.bySource && Object.keys(stats.bySource).length > 0 && (
        <div className="bg-discord-light rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Players by Source</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.bySource).map(([source, count]) => (
              <div key={source} className="text-center">
                <p className="text-2xl font-bold text-white">{count}</p>
                <p className="text-sm text-gray-400 capitalize">{source}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-discord-light rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/whitelist"
            className="bg-discord-blurple hover:bg-discord-blurple/80 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            View All Whitelisted Players
          </Link>
          <button
            disabled
            className="bg-discord-lighter text-gray-400 px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed"
          >
            Add New Member (Coming Soon)
          </button>
        </div>
      </div>
    </div>
  )
}
