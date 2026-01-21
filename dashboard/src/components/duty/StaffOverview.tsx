import { Clock, MessageSquare, Mic, Star, User, ArrowUpDown, Gamepad2, Camera, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StaffOverviewEntry, StaffOverviewSortBy } from '../../types/duty'
import { formatMinutes } from '../../lib/dutyUtils'

interface StaffOverviewProps {
  entries: StaffOverviewEntry[]
  isLoading?: boolean
  sortBy: StaffOverviewSortBy
  onSortChange: (sortBy: StaffOverviewSortBy) => void
  hideHeader?: boolean
}

const SORT_LABELS: Record<StaffOverviewSortBy, string> = {
  points: 'Points',
  time: 'Duty Time',
  tickets: 'Tickets',
  voice: 'Voice Time',
  server: 'Server Time',
  admin_cam: 'Admin Cam',
  chat: 'Chat',
}

export default function StaffOverview({
  entries,
  isLoading,
  sortBy,
  onSortChange,
  hideHeader = false,
}: StaffOverviewProps) {
  if (isLoading) {
    return (
      <div className="bg-discord-light rounded-lg overflow-hidden">
        {!hideHeader && (
          <div className="p-4 border-b border-discord-lighter">
            <h3 className="text-lg font-semibold text-white">Staff Overview</h3>
            <p className="text-xs text-gray-400 mt-1">All-time activity including off-duty contributions</p>
          </div>
        )}
        <div className="p-8 text-center text-gray-400">Loading...</div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="bg-discord-light rounded-lg overflow-hidden">
        {!hideHeader && (
          <div className="p-4 border-b border-discord-lighter">
            <h3 className="text-lg font-semibold text-white">Staff Overview</h3>
            <p className="text-xs text-gray-400 mt-1">All-time activity including off-duty contributions</p>
          </div>
        )}
        <div className="p-8 text-center text-gray-400">
          No staff activity recorded yet
        </div>
      </div>
    )
  }

  const SortableHeader = ({
    field,
    children,
    icon: Icon,
  }: {
    field: StaffOverviewSortBy
    children: React.ReactNode
    icon?: React.ComponentType<{ className?: string }>
  }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
      onClick={() => onSortChange(field)}
    >
      <div className="flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {children}
        {sortBy === field && (
          <ArrowUpDown className="w-3 h-3 text-discord-blurple" />
        )}
      </div>
    </th>
  )

  return (
    <div className="bg-discord-light rounded-lg overflow-hidden">
      {!hideHeader && (
        <div className="p-4 border-b border-discord-lighter">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Staff Overview</h3>
              <p className="text-xs text-gray-400 mt-1">All-time activity including off-duty contributions</p>
            </div>
            <div className="text-xs text-gray-500">
              Sorted by: <span className="text-gray-300">{SORT_LABELS[sortBy]}</span>
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-discord-darker/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Staff Member
              </th>
              <SortableHeader field="time" icon={Clock}>
                Duty Time
              </SortableHeader>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Sessions
              </th>
              <SortableHeader field="server" icon={Gamepad2}>
                Server
              </SortableHeader>
              <SortableHeader field="voice" icon={Mic}>
                Voice
              </SortableHeader>
              <SortableHeader field="tickets" icon={MessageSquare}>
                Tickets
              </SortableHeader>
              <SortableHeader field="admin_cam" icon={Camera}>
                Admin Cam
              </SortableHeader>
              <SortableHeader field="chat" icon={MessageCircle}>
                Chat
              </SortableHeader>
              <SortableHeader field="points" icon={Star}>
                Points
              </SortableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-discord-lighter">
            {entries.map((entry) => (
                <tr
                  key={entry.discordUserId}
                  className="hover:bg-discord-lighter/50 transition-colors"
                >
                  {/* Rank */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-gray-400">#{entry.rank}</span>
                  </td>

                  {/* Staff Member */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {entry.steamId ? (
                      <Link
                        to={`/players/${entry.steamId}`}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        {entry.avatarUrl ? (
                          <img
                            src={entry.avatarUrl}
                            alt={entry.displayName}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-discord-blurple/30 flex items-center justify-center">
                            <User className="w-4 h-4 text-discord-blurple" />
                          </div>
                        )}
                        <span className="text-white font-medium hover:text-discord-blurple transition-colors">
                          {entry.displayName}
                        </span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        {entry.avatarUrl ? (
                          <img
                            src={entry.avatarUrl}
                            alt={entry.displayName}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-discord-blurple/30 flex items-center justify-center">
                            <User className="w-4 h-4 text-discord-blurple" />
                          </div>
                        )}
                        <span className="text-white font-medium">
                          {entry.displayName}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Duty Time */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-green-400 font-semibold">
                      {formatMinutes(entry.totalDutyMinutes, true)}
                    </span>
                  </td>

                  {/* Sessions */}
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                    {entry.totalSessions}
                  </td>

                  {/* Server Time */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-blue-400">
                      {formatMinutes(entry.totalServerMinutes, true)}
                    </span>
                  </td>

                  {/* Voice (Total with On/Off breakdown) */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-purple-400">
                        {formatMinutes(entry.totalVoiceMinutes, true)}
                      </span>
                      {entry.offDutyVoiceMinutes > 0 && (
                        <span className="text-xs text-gray-500">
                          {formatMinutes(entry.offDutyVoiceMinutes, true)} off-duty
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Tickets (Total with On/Off breakdown) */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-amber-400">
                        {entry.totalTicketResponses}
                      </span>
                      {entry.offDutyTicketResponses > 0 && (
                        <span className="text-xs text-gray-500">
                          {entry.offDutyTicketResponses} off-duty
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Admin Cam Events */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-cyan-400">
                      {entry.totalAdminCamEvents}
                    </span>
                  </td>

                  {/* In-Game Chat Messages */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-pink-400">
                      {entry.totalIngameChatMessages}
                    </span>
                  </td>

                  {/* Total Points (with On/Off breakdown) */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-yellow-400 font-semibold">
                        {entry.totalPoints.toLocaleString()}
                      </span>
                      {entry.offDutyPoints > 0 && (
                        <span className="text-xs text-gray-500">
                          {entry.offDutyPoints.toLocaleString()} off-duty
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
