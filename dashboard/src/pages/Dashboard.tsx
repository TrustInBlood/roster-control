import { Link } from 'react-router-dom'
import { List, Users, Shield } from 'lucide-react'
import { useWhitelistStats } from '../hooks/useWhitelist'

export default function Dashboard() {
  const { data: stats, isLoading } = useWhitelistStats()

  const cards = [
    {
      name: 'Total Whitelist Entries',
      value: stats?.total ?? '-',
      icon: List,
      href: '/whitelist',
      color: 'bg-blue-500',
    },
    {
      name: 'Active Entries',
      value: stats?.active ?? '-',
      icon: Users,
      href: '/whitelist?status=active',
      color: 'bg-green-500',
    },
    {
      name: 'Revoked Entries',
      value: stats?.revoked ?? '-',
      icon: Shield,
      href: '/whitelist?status=revoked',
      color: 'bg-red-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Overview of your roster management system</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.name}
            to={card.href}
            className="bg-discord-light rounded-lg p-6 hover:bg-discord-lighter transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className={`${card.color} p-3 rounded-lg`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-400">{card.name}</p>
                <p className="text-2xl font-bold text-white">
                  {isLoading ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    card.value
                  )}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Source Breakdown */}
      {stats?.bySource && Object.keys(stats.bySource).length > 0 && (
        <div className="bg-discord-light rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Entries by Source</h2>
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
            View All Whitelist Entries
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
