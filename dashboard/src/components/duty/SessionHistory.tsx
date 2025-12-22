import { Clock, User, LogOut, Timer, ShieldOff, Headphones, MessageSquare, Star } from 'lucide-react'
import type { DutySessionEntry, SessionEndReason } from '../../types/duty'
import { formatDuration } from '../../lib/dutyUtils'

interface SessionHistoryProps {
  sessions: DutySessionEntry[]
  isLoading?: boolean
}

function getEndReasonBadge(reason: SessionEndReason | null): { label: string; color: string; icon: typeof LogOut } | null {
  switch (reason) {
    case 'manual':
      return { label: 'Manual', color: 'bg-green-500/20 text-green-400', icon: LogOut }
    case 'auto_timeout':
      return { label: 'Timeout', color: 'bg-yellow-500/20 text-yellow-400', icon: Timer }
    case 'role_removed':
      return { label: 'Role Removed', color: 'bg-red-500/20 text-red-400', icon: ShieldOff }
    default:
      return null
  }
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function SessionHistory({ sessions, isLoading }: SessionHistoryProps) {
  if (isLoading) {
    return (
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <div className="p-4 border-b border-discord-lighter">
          <h3 className="text-lg font-semibold text-white">Session History</h3>
        </div>
        <div className="p-8 text-center text-gray-400">Loading...</div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <div className="p-4 border-b border-discord-lighter">
          <h3 className="text-lg font-semibold text-white">Session History</h3>
        </div>
        <div className="p-8 text-center text-gray-400">
          No session history found
        </div>
      </div>
    )
  }

  return (
    <div className="bg-discord-light rounded-lg overflow-hidden">
      <div className="p-4 border-b border-discord-lighter">
        <h3 className="text-lg font-semibold text-white">Session History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-discord-darker/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Staff Member
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Started
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Duration
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Activity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Points
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Ended
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-discord-lighter">
            {sessions.map((session) => {
              const endReasonBadge = getEndReasonBadge(session.endReason)
              const isAdmin = session.dutyType === 'admin'
              const typeColor = isAdmin ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'

              return (
                <tr
                  key={session.id}
                  className="hover:bg-discord-lighter/50 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {session.avatarUrl ? (
                        <img
                          src={session.avatarUrl}
                          alt={session.displayName}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-discord-blurple/30 flex items-center justify-center">
                          <User className="w-4 h-4 text-discord-blurple" />
                        </div>
                      )}
                      <span className="text-white font-medium">
                        {session.displayName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs px-2 py-1 rounded-full ${typeColor}`}>
                      {isAdmin ? 'Admin' : 'Tutor'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300 text-sm">
                    {formatDateTime(session.sessionStart)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-green-400 font-semibold">
                      {formatDuration(session.durationMinutes * 60 * 1000, true)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-xs">
                      {session.voiceMinutes > 0 && (
                        <div className="flex items-center gap-1 text-purple-400">
                          <Headphones className="w-3 h-3" />
                          <span>{session.voiceMinutes}m</span>
                        </div>
                      )}
                      {session.ticketResponses > 0 && (
                        <div className="flex items-center gap-1 text-yellow-400">
                          <MessageSquare className="w-3 h-3" />
                          <span>{session.ticketResponses}</span>
                        </div>
                      )}
                      {session.voiceMinutes === 0 && session.ticketResponses === 0 && (
                        <span className="text-gray-500">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-white font-medium">
                      {session.totalPoints}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {session.isActive ? (
                      <span className="flex items-center gap-1.5 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full w-fit">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                        Active
                      </span>
                    ) : endReasonBadge ? (
                      <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full w-fit ${endReasonBadge.color}`}>
                        <endReasonBadge.icon className="w-3 h-3" />
                        {endReasonBadge.label}
                      </span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
