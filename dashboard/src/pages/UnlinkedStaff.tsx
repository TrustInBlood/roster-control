import { RefreshCw, UserX, Users, Link as LinkIcon } from 'lucide-react'
import { useUnlinkedStaff } from '../hooks/useAudit'

export default function UnlinkedStaff() {
  const { data, isLoading, refetch, isFetching } = useUnlinkedStaff()

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-discord-blurple mx-auto"></div>
          <p className="text-gray-400 mt-4">Loading staff members...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Unlinked Staff</h1>
          <p className="text-gray-400 mt-1">
            Staff members without high-confidence Steam account links
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="bg-discord-lighter hover:bg-discord-light text-white px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500/20 p-2 rounded-lg">
              <UserX className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{data?.total ?? 0}</p>
              <p className="text-sm text-gray-400">Unlinked Staff</p>
            </div>
          </div>
        </div>
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/20 p-2 rounded-lg">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{data?.staffTotal ?? 0}</p>
              <p className="text-sm text-gray-400">Total Staff</p>
            </div>
          </div>
        </div>
        <div className="bg-discord-light rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/20 p-2 rounded-lg">
              <LinkIcon className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {data ? Math.round(((data.staffTotal - data.total) / data.staffTotal) * 100) : 0}%
              </p>
              <p className="text-sm text-gray-400">Linked Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* All Clear Message */}
      {data?.total === 0 && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
          <div className="bg-green-500/20 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
            <LinkIcon className="w-6 h-6 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-green-400 mb-1">All Staff Linked!</h3>
          <p className="text-gray-400">
            All staff members have linked their Steam accounts with high confidence.
          </p>
        </div>
      )}

      {/* Staff Groups */}
      {data && data.total > 0 && data.groups && (
        <div className="space-y-4">
          {Object.entries(data.groups).map(([groupName, members]) => (
            <div key={groupName} className="bg-discord-light rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-discord-lighter">
                <h3 className="text-lg font-semibold text-white">
                  {groupName}
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({members.length})
                  </span>
                </h3>
              </div>
              <div className="divide-y divide-discord-lighter">
                {members.map((member) => (
                  <div
                    key={member.discordId}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-discord-lighter/50 transition-colors"
                  >
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.username}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-discord-darker flex items-center justify-center">
                        <span className="text-gray-400 text-sm">
                          {member.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-white font-medium">{member.username}</p>
                      <p className="text-sm text-gray-400">{member.userTag}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-500 font-mono">
                        {member.discordId}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-discord-light rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-discord-blurple" />
          How to Link
        </h4>
        <p className="text-sm text-gray-400">
          Staff members can use the <code className="bg-discord-darker px-1.5 py-0.5 rounded text-discord-blurple">/linkid</code> command
          in Discord to link their Steam account and gain Squad server admin permissions and whitelist access.
          A high-confidence link (score 1.0+) is required for staff privileges.
        </p>
      </div>
    </div>
  )
}
