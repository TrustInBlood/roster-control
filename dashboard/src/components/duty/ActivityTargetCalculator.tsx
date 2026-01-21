import { useMemo } from 'react'
import { TrendingUp, Clock, Volume2, MessageSquare, Camera, MessageCircle } from 'lucide-react'
import InfoTooltip from '../ui/InfoTooltip'

interface PointValues {
  base_per_minute: number
  voice_per_minute: number
  ticket_response: number
  admin_cam: number
  ingame_chat: number
  on_duty_multiplier: number
}

interface ActivityTargetCalculatorProps {
  weeklyTarget: number
  pointValues: PointValues
}

interface ExampleMix {
  name: string
  description: string
  dutyHours: number
  voiceHours: number
  ticketResponses: number
  adminCamUses: number
  ingameMessages: number
}

export default function ActivityTargetCalculator({
  weeklyTarget,
  pointValues,
}: ActivityTargetCalculatorProps) {

  // Calculate how much of each activity alone equals the target
  const equivalencies = useMemo(() => {
    const { base_per_minute, voice_per_minute, ticket_response, admin_cam, ingame_chat, on_duty_multiplier } =
      pointValues

    const effectiveBase = base_per_minute * on_duty_multiplier
    const effectiveVoice = voice_per_minute * on_duty_multiplier

    return {
      dutyHours: weeklyTarget / (effectiveBase * 60),
      voiceHours: weeklyTarget / (effectiveVoice * 60),
      ticketResponses: weeklyTarget / (ticket_response * on_duty_multiplier),
      adminCamUses: weeklyTarget / (admin_cam * on_duty_multiplier),
      ingameMessages: weeklyTarget / (ingame_chat * on_duty_multiplier),
    }
  }, [weeklyTarget, pointValues])

  // Generate example mixes that achieve the target
  const exampleMixes = useMemo((): ExampleMix[] => {
    const { base_per_minute, voice_per_minute, ticket_response, admin_cam, ingame_chat, on_duty_multiplier } =
      pointValues

    const calcPoints = (mix: Omit<ExampleMix, 'name' | 'description'>) => {
      return (
        mix.dutyHours * 60 * base_per_minute * on_duty_multiplier +
        mix.voiceHours * 60 * voice_per_minute * on_duty_multiplier +
        mix.ticketResponses * ticket_response * on_duty_multiplier +
        mix.adminCamUses * admin_cam * on_duty_multiplier +
        mix.ingameMessages * ingame_chat * on_duty_multiplier
      )
    }

    // Scale mixes to hit the target
    const scaleMix = (baseMix: Omit<ExampleMix, 'name' | 'description'>): Omit<ExampleMix, 'name' | 'description'> => {
      const basePoints = calcPoints(baseMix)
      if (basePoints === 0) return baseMix
      const scale = weeklyTarget / basePoints
      return {
        dutyHours: Math.round(baseMix.dutyHours * scale * 10) / 10,
        voiceHours: Math.round(baseMix.voiceHours * scale * 10) / 10,
        ticketResponses: Math.round(baseMix.ticketResponses * scale),
        adminCamUses: Math.round(baseMix.adminCamUses * scale),
        ingameMessages: Math.round(baseMix.ingameMessages * scale),
      }
    }

    return [
      {
        name: 'Balanced',
        description: 'Mix of all activities',
        ...scaleMix({
          dutyHours: 10,
          voiceHours: 5,
          ticketResponses: 15,
          adminCamUses: 10,
          ingameMessages: 30,
        }),
      },
      {
        name: 'Voice-Focused',
        description: 'Heavy voice channel presence',
        ...scaleMix({
          dutyHours: 8,
          voiceHours: 12,
          ticketResponses: 5,
          adminCamUses: 5,
          ingameMessages: 10,
        }),
      },
      {
        name: 'Support-Focused',
        description: 'Ticket and chat heavy',
        ...scaleMix({
          dutyHours: 8,
          voiceHours: 2,
          ticketResponses: 30,
          adminCamUses: 5,
          ingameMessages: 50,
        }),
      },
    ]
  }, [weeklyTarget, pointValues])

  const formatNumber = (n: number) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    if (n >= 100) return n.toFixed(0)
    if (n >= 10) return n.toFixed(1)
    return n.toFixed(1)
  }

  return (
    <div className="space-y-6">
      {/* Target Display */}
      <div className="flex items-center gap-3 bg-discord-darker rounded-lg p-4">
        <TrendingUp className="w-5 h-5 text-discord-blurple" />
        <div>
          <div className="text-sm text-gray-400">Weekly Points Target</div>
          <div className="text-2xl font-bold text-white">
            {weeklyTarget.toLocaleString()} pts
          </div>
        </div>
      </div>

      {/* Equivalencies Table */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <span className="font-medium">Point Equivalencies</span>
          <InfoTooltip text="How much of each activity alone would be needed to reach the weekly target. Staff typically combine multiple activities." />
        </div>
        <div className="bg-discord-darker rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-discord-lighter">
                <th className="text-left text-gray-400 font-medium px-4 py-2">Activity</th>
                <th className="text-right text-gray-400 font-medium px-4 py-2">Amount for {weeklyTarget.toLocaleString()} pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-discord-lighter/50">
              <tr>
                <td className="px-4 py-2.5 text-gray-300 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  On-Duty Time
                </td>
                <td className="px-4 py-2.5 text-white text-right font-medium tabular-nums">
                  {formatNumber(equivalencies.dutyHours)} hours
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-gray-300 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-green-400" />
                  Voice Channel Time
                </td>
                <td className="px-4 py-2.5 text-white text-right font-medium tabular-nums">
                  {formatNumber(equivalencies.voiceHours)} hours
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-gray-300 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-yellow-400" />
                  Ticket Responses
                </td>
                <td className="px-4 py-2.5 text-white text-right font-medium tabular-nums">
                  {formatNumber(equivalencies.ticketResponses)} responses
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-gray-300 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-purple-400" />
                  Admin Cam Uses
                </td>
                <td className="px-4 py-2.5 text-white text-right font-medium tabular-nums">
                  {formatNumber(equivalencies.adminCamUses)} uses
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 text-gray-300 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-orange-400" />
                  In-Game Messages
                </td>
                <td className="px-4 py-2.5 text-white text-right font-medium tabular-nums">
                  {formatNumber(equivalencies.ingameMessages)} messages
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Example Mixes */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <span className="font-medium">Example Activity Mixes</span>
          <InfoTooltip text="Sample combinations of activities that would achieve the weekly target. These are guidelines - actual staff activity will vary." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {exampleMixes.map((mix) => (
            <div key={mix.name} className="bg-discord-darker rounded-lg p-4">
              <div className="font-medium text-white mb-1">{mix.name}</div>
              <div className="text-xs text-gray-500 mb-3">{mix.description}</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-400">
                  <span>Duty time</span>
                  <span className="text-gray-300">{mix.dutyHours}h</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Voice time</span>
                  <span className="text-gray-300">{mix.voiceHours}h</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Tickets</span>
                  <span className="text-gray-300">{mix.ticketResponses}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Admin cam</span>
                  <span className="text-gray-300">{mix.adminCamUses}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>In-game chat</span>
                  <span className="text-gray-300">{mix.ingameMessages}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pointValues.on_duty_multiplier !== 1 && (
        <div className="text-xs text-gray-500">
          * All calculations include the {pointValues.on_duty_multiplier}x on-duty multiplier
        </div>
      )}
    </div>
  )
}
