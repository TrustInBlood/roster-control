import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useWhitelistStats } from '../hooks/useWhitelist'

export default function Dashboard() {
  const { data: stats, isLoading } = useWhitelistStats()

  return (
    <div className="space-y-6">
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
