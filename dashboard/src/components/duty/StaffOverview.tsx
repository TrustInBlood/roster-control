import { useState } from 'react'
import { Clock, MessageSquare, Mic, Star, User, ArrowUpDown, ArrowUp, ArrowDown, Gamepad2, Camera, MessageCircle, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StaffOverviewEntry, StaffOverviewSortBy, StaffOverviewSortOrder } from '../../types/duty'
import { formatMinutes } from '../../lib/dutyUtils'

interface StaffOverviewProps {
  entries: StaffOverviewEntry[]
  isLoading?: boolean
  sortBy: StaffOverviewSortBy
  sortOrder?: StaffOverviewSortOrder
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
  sortOrder = 'desc',
  onSortChange,
  hideHeader = false,
}: StaffOverviewProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter entries based on search query (case-insensitive)
  const filteredEntries = searchQuery
    ? entries.filter(entry =>
        entry.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries

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

  const SortIcon = ({ field }: { field: StaffOverviewSortBy }) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
    return sortOrder === 'desc'
      ? <ArrowDown className="w-3 h-3 text-discord-blurple" />
      : <ArrowUp className="w-3 h-3 text-discord-blurple" />
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
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group"
      onClick={() => onSortChange(field)}
    >
      <div className="flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {children}
        <SortIcon field={field} />
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
              Sorted by: <span className="text-gray-300">{SORT_LABELS[sortBy]} ({sortOrder === 'desc' ? 'High to Low' : 'Low to High'})</span>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="p-4 border-b border-discord-lighter">
        <div className="relative">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
            <Search className={`w-4 h-4 ${searchQuery ? 'text-discord-blurple' : 'text-gray-400'}`} />
            {searchQuery && (
              <span className="absolute -top-2 -right-2 bg-discord-blurple text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {filteredEntries.length}
              </span>
            )}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search staff..."
            className={`w-full pl-10 pr-10 py-2 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-discord-blurple transition-colors ${
              searchQuery
                ? 'bg-discord-blurple/10 border-discord-blurple/50'
                : 'bg-discord-darker border-discord-lighter'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-discord-darker/50">
            {/* Category Headers */}
            <tr className="border-b border-discord-lighter/30">
              <th colSpan={2}></th>
              <th colSpan={2} className="px-4 py-2 text-center text-xs font-semibold text-green-400 uppercase tracking-wider bg-green-400/5">
                Duty
              </th>
              <th colSpan={2} className="px-4 py-2 text-center text-xs font-semibold text-purple-400 uppercase tracking-wider bg-purple-400/5">
                Discord
              </th>
              <th colSpan={3} className="px-4 py-2 text-center text-xs font-semibold text-blue-400 uppercase tracking-wider bg-blue-400/5">
                In-Game
              </th>
              <th></th>
            </tr>
            {/* Column Headers */}
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Staff Member
              </th>
              {/* Duty Stats (Green) */}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors bg-green-400/5 group" onClick={() => onSortChange('time')}>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Duty Time
                  <SortIcon field="time" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider bg-green-400/5">
                Sessions
              </th>
              {/* Discord Activity (Purple) */}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors bg-purple-400/5 group" onClick={() => onSortChange('voice')}>
                <div className="flex items-center gap-1">
                  <Mic className="w-3 h-3" />
                  Voice
                  <SortIcon field="voice" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors bg-purple-400/5 group" onClick={() => onSortChange('tickets')}>
                <div className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  Tickets
                  <SortIcon field="tickets" />
                </div>
              </th>
              {/* In-Game Activity (Blue) */}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors bg-blue-400/5 group" onClick={() => onSortChange('server')}>
                <div className="flex items-center gap-1">
                  <Gamepad2 className="w-3 h-3" />
                  Server
                  <SortIcon field="server" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors bg-blue-400/5 group" onClick={() => onSortChange('admin_cam')}>
                <div className="flex items-center gap-1">
                  <Camera className="w-3 h-3" />
                  Admin Cam
                  <SortIcon field="admin_cam" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors bg-blue-400/5 group" onClick={() => onSortChange('chat')}>
                <div className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  Chat
                  <SortIcon field="chat" />
                </div>
              </th>
              <SortableHeader field="points" icon={Star}>
                Points
              </SortableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-discord-lighter">
            {filteredEntries.map((entry) => (
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

                  {/* Duty Time (Green) */}
                  <td className="px-4 py-3 whitespace-nowrap bg-green-400/5">
                    <span className="text-green-400 font-semibold">
                      {formatMinutes(entry.totalDutyMinutes, true)}
                    </span>
                  </td>

                  {/* Sessions (Green) */}
                  <td className="px-4 py-3 whitespace-nowrap bg-green-400/5">
                    <span className="text-green-400">
                      {entry.totalSessions}
                    </span>
                  </td>

                  {/* Voice (Purple) */}
                  <td className="px-4 py-3 whitespace-nowrap bg-purple-400/5">
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

                  {/* Tickets (Purple) */}
                  <td className="px-4 py-3 whitespace-nowrap bg-purple-400/5">
                    <div className="flex flex-col">
                      <span className="text-purple-400">
                        {entry.totalTicketResponses}
                      </span>
                      {entry.offDutyTicketResponses > 0 && (
                        <span className="text-xs text-gray-500">
                          {entry.offDutyTicketResponses} off-duty
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Server Time (Blue) */}
                  <td className="px-4 py-3 whitespace-nowrap bg-blue-400/5">
                    <span className="text-blue-400">
                      {formatMinutes(entry.totalServerMinutes, true)}
                    </span>
                  </td>

                  {/* Admin Cam Events (Blue) */}
                  <td className="px-4 py-3 whitespace-nowrap bg-blue-400/5">
                    <span className="text-blue-400">
                      {entry.totalAdminCamEvents}
                    </span>
                  </td>

                  {/* In-Game Chat Messages (Blue) */}
                  <td className="px-4 py-3 whitespace-nowrap bg-blue-400/5">
                    <span className="text-blue-400">
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
