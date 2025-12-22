import { Activity, Clock, User, Headphones, MessageSquare, Star } from 'lucide-react'
import type { DutySessionEntry } from '../../types/duty'
import { formatDuration } from '../../lib/dutyUtils'

interface ActiveSessionsProps {
  sessions: DutySessionEntry[]
  isLoading?: boolean
}

function formatTimeAgo(dateString: string): string {
  const start = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  return formatDuration(diffMs, true)
}

export default function ActiveSessions({ sessions, isLoading }: ActiveSessionsProps) {
  if (isLoading) {
    return (
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <div className="p-4 border-b border-discord-lighter">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold text-white">Currently On Duty</h3>
          </div>
        </div>
        <div className="p-8 text-center text-gray-400">Loading...</div>
      </div>
    )
  }

  const adminSessions = sessions.filter(s => s.dutyType === 'admin')
  const tutorSessions = sessions.filter(s => s.dutyType === 'tutor')

  if (sessions.length === 0) {
    return (
      <div className="bg-discord-light rounded-lg overflow-hidden">
        <div className="p-4 border-b border-discord-lighter">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-white">Currently On Duty</h3>
          </div>
        </div>
        <div className="p-8 text-center text-gray-400">
          No one is currently on duty
        </div>
      </div>
    )
  }

  return (
    <div className="bg-discord-light rounded-lg overflow-hidden">
      <div className="p-4 border-b border-discord-lighter">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-400 animate-pulse" />
            <h3 className="text-lg font-semibold text-white">Currently On Duty</h3>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-red-400">{adminSessions.length} Admin{adminSessions.length !== 1 ? 's' : ''}</span>
            <span className="text-blue-400">{tutorSessions.length} Tutor{tutorSessions.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>
    </div>
  )
}

interface SessionCardProps {
  session: DutySessionEntry
}

function SessionCard({ session }: SessionCardProps) {
  const isAdmin = session.dutyType === 'admin'
  const borderColor = isAdmin ? 'border-l-red-500' : 'border-l-blue-500'
  const badgeColor = isAdmin ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
  const badgeText = isAdmin ? 'Admin' : 'Tutor'

  return (
    <div className={`bg-discord-darker rounded-lg p-4 border-l-4 ${borderColor}`}>
      <div className="flex items-start gap-3">
        {session.avatarUrl ? (
          <img
            src={session.avatarUrl}
            alt={session.displayName}
            className="w-10 h-10 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-discord-blurple/30 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-discord-blurple" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium truncate">{session.displayName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor}`}>
              {badgeText}
            </span>
          </div>

          <div className="flex items-center gap-1 text-gray-400 text-sm mt-1">
            <Clock className="w-3 h-3" />
            <span>On duty for {formatTimeAgo(session.sessionStart)}</span>
          </div>

          {/* Activity indicators */}
          <div className="flex items-center gap-3 mt-2 text-xs">
            {session.voiceMinutes > 0 && (
              <div className="flex items-center gap-1 text-purple-400">
                <Headphones className="w-3 h-3" />
                <span>{session.voiceMinutes}m voice</span>
              </div>
            )}
            {session.ticketResponses > 0 && (
              <div className="flex items-center gap-1 text-yellow-400">
                <MessageSquare className="w-3 h-3" />
                <span>{session.ticketResponses} ticket{session.ticketResponses !== 1 ? 's' : ''}</span>
              </div>
            )}
            {session.totalPoints > 0 && (
              <div className="flex items-center gap-1 text-green-400">
                <Star className="w-3 h-3" />
                <span>{session.totalPoints} pts</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
